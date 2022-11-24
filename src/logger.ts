import {moment} from 'obsidian';
import type { Moment } from 'moment';
import { getDailyNote, createDailyNote, getAllDailyNotes, appHasDailyNotesPluginLoaded } from 'obsidian-daily-notes-interface';
import {TrackerException} from './exception.ts';
import {section as sectionParser, activitySections as activitySectionsParser} from './parsers.ts';

activitySectionsParser.init('activity tracker');

function isLoggingNeeded(section, currentMoment, remainActive) {
	
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
	let section = sectionParser.parse(text);
	const now = moment();
	
	// проверяем надо ли писать новую запись лога
	
	const check = isLoggingNeeded(section, now, remainActive);
	
	console.log('isLoggingNeeded', check);
	
	if(!check) return false;
	
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
	
	return sectionParser.stringify(section);
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
			
			let sections = activitySectionsParser.parseDocument(data.content);
			if(sections)
			for(let section of sections)
			{
				const updated = updateActivitySection(section.inner, remainActive);
				if(updated)
				{
					updatedContent = updatedContent.replace(section.outer, activitySectionsParser.wrapSection(updated));
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
