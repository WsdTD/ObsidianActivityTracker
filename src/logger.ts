import {moment} from 'obsidian';
import type { Moment } from 'moment';
import { getDailyNote, createDailyNote, getAllDailyNotes, appHasDailyNotesPluginLoaded } from 'obsidian-daily-notes-interface';
import {TrackerException} from './exception.ts';

const sectionLabel = 'activity tracker';
const activitySectionRegex = new RegExp(`<!-- ${sectionLabel} -->(.+?)<!-- \\/${sectionLabel} -->`, 'gmus');
const sectionParseRegex = /^(?<tasks>.*?)(<!-- report -->(?<report>.*?))?(<!-- log -->(?<log>.*?))?$/us;
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
			for(let i = list.length - 1; i >= 0; i--)
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
		});
	}
	return list;
}

function stringifyLog(list: object): string {
	let ret = [];
	for(let line of list)
	{
		let duration = '';
		if(line.end)
		{
			let start = moment(line.start, "HH:mm");
			let end = moment(line.end, "HH:mm");
			if(start.isSame(end)) continue;
			if(start.isAfter(end)) start.substract(24*60*60*1000);
			duration = ' ' + moment.duration(end.diff(start)).humanize();
		}
		ret.push(`- ${line.tasks.join('; ')}; ${line.start}${line.end ? ('-'+line.end) : ''};${duration}`);
	}
	return ret.join("\n");
}

function generateReport(log: object, tasks: object) : string|false {
	
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
	
	if(ret.length === 0) return false;
	
	return `task | duration\n-- | --\n${ret.join("\n")}`;
}

function parseSection(text: string) : object|false {
	parts = sectionParseRegex.exec(text);
	if(!parts) return false;
	return {
		tasks: parseTasks(parts.groups.tasks),
		log: parts.groups.log ? parseLog(parts.groups.log) : [],
		report: parts.groups.report || null,
	};
}
function stringifySection(section: object): string {
	let ret = stringifyTasks(section.tasks);
	if(!section.log) return ret;
	const log = stringifyLog(section.log);
	const report = generateReport(section.log, section.tasks);
	if(report)
		ret += `\n\n<!-- report -->\n${report}`;
	if(log)
		ret += `\n\n<!-- log -->\n${log}`;
	return ret;
}


function isLoggingNeeded(section, currentMoment, remainActive)
{
	// если логов вообще нет - надо создать первую не закрытую запись
	if(!section.log || section.log.length === 0) return 1;
	
	let activeLog = section.log[section.log.length - 1];
	
	// если последняя запись не активная - надо создать новую не закрытую запись
	if(activeLog.end && remainActive) return 2;
	
	// если последняя запись открыта и не надо оставаться активным
	if(!activeLog.end && !remainActive) return 3;
	
	
	if(remainActive)
	{
		// проверяем совпадают ли таски
		const activeTasks = section.tasks.filter(v => v.checked).map(v => v.fullname);
		
		//размер
		if(activeTasks.length !== activeLog.tasks.length) return 4;
		
		// сравниваем сами таски
		for(let i = 0; i < activeTasks.length; i++)
			if(activeTasks[i] !== activeLog.tasks[i])
				return 5;
			
		// если последнее логирование было больше часа назад
		if(moment.duration(currentMoment.diff(moment(activeLog.start, "HH:mm"))).asHours() >= 1)
			return 6;
	}
	
	// если ни одно условие не прошло - сообщаем, что не надо ничего менять
	return false;
}

/**
 * записать текущую активность в лог секции
 * получает старый текст секции
 * возвращает новый, с добавленной записью лога
 **/
function updateActivitySection(text: string, remainActive: boolean): string|false {
	let section = parseSection(text);
	const now = moment();
	
	// проверяем надо ли писать новую запись лога
	
	const test = isLoggingNeeded(section, now, remainActive);
	
	console.log('isLoggingNeeded', test);
	
	if(!test) return false;
	
	// сохраняем предыдущую запись (если она есть и открыта)
	if(section.log.length > 0 && !section.log[section.log.length - 1].end)
	{
		let activeLog = section.log.pop();
		activeLog.end = now.format("HH:mm");
		const start = moment(activeLog.start, "HH:mm");
		if(start.isAfter(now)) // на случай полночи
			start.substract(24*60*60*1000);
		section.log.push(activeLog);
	}

	if(remainActive)
	{
		// starting new section
		const activeTasks = section.tasks.filter(v => v.checked).map(v => v.fullname);
		section.log.push({
			tasks: activeTasks,
			start: now.format("HH:mm"),
			end: false,
		});
	}
	
	return stringifySection(section);
}

function getLoggingFile(): Promise<TFile> {
	if(!appHasDailyNotesPluginLoaded()) return Promise.reject("daily notes plugin is not enabled");
	const file = getDailyNote(moment(), getAllDailyNotes());
	if(file) return Promise.resolve(file);
	return createDailyNote(moment());
}


function waitForFileToBeClean(plugin, path): Promise<void> {
	let ps = []
	plugin.app.workspace.iterateAllLeaves(leaf => {
		if(!leaf.view) return;
		if(!leaf.view._loaded) return;
		if(!leaf.view.file) return;
		if(!leaf.view.save) return;
		if(!leaf.view.dirty) return;
		ps.push(leaf.view.save())
		console.log('waiting for file to become clean for writing:', leaf.view.file.path);
	});
	return Promise.all(ps);
}

/**
 * проверить нужно ли логирование, если да, то
 * логировать текущий таймер, начать новый
 */
// @todo: что с пролемой полночи?
export function writeLogRecord(plugin, remainActive): Promise<void> {
	return getLoggingFile()
		.then(file => waitForFileToBeClean(plugin, file.path).then(() => file))
		.then(file => plugin.app.vault.adapter.read(file.path).then(c => ({file: file, content: c})))
		.then(data => {
			let updatedContent = data.content;
			let updatedSectionsCount = 0;
			while((section = activitySectionRegex.exec(data.content)) !== null) {
				const updated = updateActivitySection(section[1], remainActive);
				if(updated)
				{
					updatedContent = updatedContent.replace(section[0], `<!-- activity tracker -->\n${updated}\n<!-- /activity tracker -->`);
					updatedSectionsCount++;
				}
			}
			
			if(updatedSectionsCount > 0)
				data.updatedContent = updatedContent;
			else
				data.updatedContent = null;
			
			data.updatedSectionsCount = updatedSectionsCount;
			return data;
		})
		.then(data => {
			if(data.updatedContent)
				return waitForFileToBeClean(plugin, data.file.path)
					.then(() => plugin.app.vault.adapter.write(data.file.path, data.updatedContent))
					.then(() => true);
			return false;
		})
		;
}
