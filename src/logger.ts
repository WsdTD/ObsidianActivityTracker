import {moment} from 'obsidian';
import type { Moment } from 'moment';
import {TrackerException} from './exception.ts';
import {section as sectionParser, activitySections as activitySectionsParser} from './parsers.ts';



function isLoggingNeeded(section, currentMoment, remainActive, settings) {
	
	// если логов вообще нет - надо создать первую не закрытую запись
	if(!section.log || section.log.length === 0) return true;
	
	let activeLog = section.log[section.log.length - 1];
	
	// если последняя запись не активная - надо создать новую не закрытую запись
	if(activeLog.end && remainActive) return true;
	
	// если последняя запись открыта и не надо оставаться активным
	if(!activeLog.end && !remainActive) return true;
	
	
	if(remainActive)
	{
		// проверяем совпадают ли таски
		const activeTasks = section.tasks.filter(v => v.checked).map(v => v.fullname);
		
		//размер
		if(activeTasks.length !== activeLog.tasks.length) return true;
		
		// сравниваем сами таски
		for(let i = 0; i < activeTasks.length; i++)
			if(activeTasks[i] !== activeLog.tasks[i])
				return true;
			
		// если последнее логирование было больше часа назад
		if(moment.duration(currentMoment.diff(moment(activeLog.start, "HH:mm"))).asMinutes() >= settings.maxInterval)
			return true;
	}
	
	// если ни одно условие не прошло - сообщаем, что не надо ничего менять
	return false;
}

/**
 * записать текущую активность в лог секции
 * получает старый текст секции
 * возвращает новый, с добавленной записью лога
 **/
function updateActivitySection(text: string, remainActive: boolean, settings): string|false {
	let section = sectionParser.parse(text);
	const now = moment();
	
	// проверяем надо ли писать новую запись лога
	if(!isLoggingNeeded(section, now, remainActive, settings))
		return false;
	
	// сохраняем предыдущую запись (если она есть и открыта)
	if(section.log.length > 0 && !section.log[section.log.length - 1].end)
	{
		let activeLog = section.log.pop();
		activeLog.end = now.format("HH:mm");
		const start = moment(activeLog.start, "HH:mm");
		if(start.isAfter(now)) // на случай полночи
			start.subtract(24*60*60*1000);
		
		let durationMinutes = moment.duration(now.diff(start)).asMinutes();
		
		// если интервал слишком большой, то сокращать его до максимально допустимого 
		if(durationMinutes > settings.maxInterval)
			activeLog.end = start.clone().add(settings.maxInterval * 60*1000).format("HH:mm");
		
		//не логировать если активность была слишком короткой
		if(durationMinutes >= settings.minInterval)
			section.log.push(activeLog);
	}

	if(remainActive)
	{
		// starting new section
		const activeTasks = section.tasks.filter(v => v.checked).map(v => v.fullname);
		if(activeTasks.length === 0)
			activeTasks.push("ничего не выбрано");
		section.log.push({
			tasks: activeTasks,
			start: now.format("HH:mm"),
			end: false,
		});
	}
	
	return sectionParser.stringify(section);
}

function waitForFileToBeClean(app, path): Promise<void> {
	let ps = []
	app.workspace.iterateAllLeaves(leaf => {
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
export function processLogRecordsInFile(app, filePath, remainActive, settings): Promise<void> {
	
	if(!activitySectionsParser.initialized())
		activitySectionsParser.init(settings.trackerLabel);
	
	return waitForFileToBeClean(app, filePath)
		.then(() => app.vault.adapter.read(filePath))
		.then(content => {
			let updatedSectionsCount = 0;
			
			let sections = activitySectionsParser.parseDocument(content);
			if(sections)
			for(let section of sections)
			{
				const updated = updateActivitySection(section.inner, remainActive, settings);
				if(updated)
				{
					content = content.replace(section.outer, activitySectionsParser.wrapSection(updated));
					updatedSectionsCount++;
				}
			}
			
			if(updatedSectionsCount > 0)
				return content;
			
			return null;
		})
		.then(content => {
			if(content)
				return app.vault.adapter.write(filePath, content)
					.then(() => true);
			return false;
		})
}
