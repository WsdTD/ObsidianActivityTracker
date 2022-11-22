import {moment} from 'obsidian';
import type { Moment } from 'moment';
import { getDailyNote, createDailyNote, getAllDailyNotes, appHasDailyNotesPluginLoaded } from 'obsidian-daily-notes-interface';
import {TrackerException} from './exception.ts';

const sectionLabel = 'activity tracker';
const activitySectionRegex = new RegExp(`<!-- ${sectionLabel} -->(.+?)<!-- \\/${sectionLabel} -->`, 'gmus');
const sectionParseRegex = /^(?<tasks>.*?)(<!-- log -->(?<log>.*?))?(<!-- report -->(?<report>.*))?$/us;
const taskParseRegex = /^(?<spaces>\s*)[\*\-]\s+\[(?<check>.)\](?<label>.*)$/ugm;
const logParseRegex = /^-(?<tasks>.*?;+)\s*(?<starttime>\d\d:\d\d)(-(?<endtime>\d\d:\d\d))?;(?<length>.*)$/ugm;

function parseTasks(text: string) {
	let list = [];
	while((line = taskParseRegex.exec(text.trim())) !== null) {
		let spaces = line.groups.spaces.replace(/ {4}/g, '\t').replace(/ +/g, '\t');
		let item = {
			checked: line.groups.check !== ' ',
			label: line.groups.label.trim(),
			level: spaces.length,
		};
		item.fullname = item.label;
		if(item.level > 0)
			for(let i = list.length - 1; i >= 0; i++)
				if(list[i].level < item.level)
				{
					item.fullname = list[i].fullname + '->' + item.label;
					break;
				}
		list.push(item);
	}
	return list;
}

function stringifyTasks(list: object) : string {
	let ret = [];
	for(let line of list)
		ret.push(`${"\t".repeat(line.level)}- [${line.checked ? 'x' : ' '}] ${line.label}`);
	return ret.join("\n");
}

function parseLog(text: string) {
	let list = [];
	while((line = logParseRegex.exec(text)) !== null) {
		list.push({
			tasks: line.groups.tasks.split(';').map(v => v.trim()).filter(v => v),
			start: line.groups.starttime,
			end: line.groups.endtime || null,
			length: line.groups.length || null,
		});
	}
	return list;
}

function stringifyLog(list: object): string {
	let ret = [];
	for(let line of list)
		ret.push(`- ${line.tasks.join('; ')}; ${line.start}${line.end ? ('-'+line.end) : ''};${line.duration || ''}`);
	return ret.join("\n");
}
function parseSection(text: string) : object|false {
	parts = sectionParseRegex.exec(text);
	if(!parts) return false;
	return {
		tasks: parseTasks(parts.groups.tasks),
		log: parts.groups.log ? parseLog(parts.groups.log) : null,
		report: parts.groups.report || null,
	};
}

function generateReport(log: object, tasks: object) : string {
	
	let tasksTime = {};
	for(let line of log)
	{
		if(!line.end) continue;
		if(line.tasks.length < 1) continue;
		let start = moment(line.start, "HH:mm");
		let end = moment(line.end, "HH:mm");
		if(start.isAfter(end)) start.substract(24*60*60*1000);
		let length = end - start;
		if(line.tasks.length > 0)
			length /= line.tasks.length;
		for(let task of line.tasks)
		{
			if(!tasksTime[task]) tasksTime[task] = 0;
			tasksTime[task] += length;
		}
	}
	
	let keys = tasks.concat(Object.keys(tasksTime)).filter((v, i, o) => o.indexOf(v) === i);
	
	let ret = [];
	for(let task of keys)
	{
		let time = tasksTime[task];
		if(!time) continue;
		ret.push(`${task} | ${moment.duration(time).humanize()}`)
	}
	
	return `task | duration\n-- | --\n${ret.join("\n")}`;
}

function stringifySection(section: object): string {
	let ret = stringifyTasks(section.tasks);
	if(!section.log) return ret;
	ret += `\n\n<!-- log -->\n${stringifyLog(section.log)}`;
	ret += `\n\n<!-- report -->\n${generateReport(section.log, section.tasks)}`;
	return ret;
}

/**
 * записать текущую активность в лог секции
 * получает старый текст секции
 * возвращает новый, с добавленной записью лога
 **/
function updateActivitySection(text: string): string|false {
	let section = parseSection(text);
	
	// @todo: проверять вообще надо ли писать новую запись лога
	// сверять таски с галочками и таски из активной записи лога
	// смотреть на время старта активной записи лога
	
	const now = moment();
	if(section.log && section.log.length > 0)
	{
		let activeLog = section.log.pop();
		activeLog.end = now.format("HH:mm");
		const start = moment(activeLog.start, "HH:mm");
		if(start.isAfter(now)) // на случай полночи
			start.substract(24*60*60*1000);
		activeLog.duration = `${Math.floor((now - start) / 60000 + 0.5)} minutes`; // @todo: hours etc
		section.log.push(activeLog);
	}
	else
	{
		section.log = [];
	}

	// starting new section
	section.log.push({
		tasks: section.tasks.filter(v => v.checked).map(v => v.fullname),
		start: now.format("HH:mm"),
		end: false,
		duration: false,
	});
	
	return stringifySection(section);
}

function getLoggingFile(): Promise<TFile> {
	if(!appHasDailyNotesPluginLoaded()) return Promise.reject("daily notes plugin is not enabled");
	const file = getDailyNote(moment(), getAllDailyNotes());
	if(file) return Promise.resolve(file);
	return createDailyNote(moment());
}

/**
 * логировать текущий таймер, начать новый
 * вызывать когда надо добавить новую запись в лог
 */
export function writeLogRecord(): Promise<void> {
	return getLoggingFile()
		.then(file => this.app.vault.adapter.read(file.path).then(c => ({file: file, content: c})))
		.then(data => {
			let updatedContent = data.content;
			let updatedSectionsCount = 0;
			while((section = activitySectionRegex.exec(data.content)) !== null) {
				const updated = updateActivitySection(section[1]);
				if(updated)
				{
					updatedContent = updatedContent.replace(section[0], `<!-- activity tracker -->\n${updated}\n<!-- /activity tracker -->`);
					updatedSectionsCount++;
				}
			}
			
			if(updatedSectionsCount === 0)
				throw new TrackerException('no tracker sections updated')
			
			data.updatedContent = updatedContent;
			return data;
		})
		.then(data => this.app.vault.adapter.write(data.file.path, data.updatedContent))
		;
}
