import {moment} from 'obsidian';
import type { Moment } from 'moment';
import {TrackerException} from './exception.ts';
import {section as sectionParser, activitySections as activitySectionsParser} from './parsers.ts';

class sectionProcessor
{
	data = null;
	settings = null;
	updated = false;
	
	constructor(text: string, settings: object|null) {
		this.data = sectionParser.parse(text);
		this.settings = settings;
	}
	
	isLoggingNeeded(activeTasks, currentMoment, remainActive) {
		
		// если логов вообще нет - надо создать первую не закрытую запись
		if(!this.data.log || this.data.log.length === 0) return true;
		
		let activeLog = this.data.log[this.data.log.length - 1];
		
		// если последняя запись не активная - надо создать новую не закрытую запись
		if(activeLog.end && remainActive) return true;
		
		// если последняя запись открыта и не надо оставаться активным
		if(!activeLog.end && !remainActive) return true;
		
		if(remainActive)
		{
			// проверяем совпадают ли таски
			
			//размер
			if(activeTasks.length !== activeLog.tasks.length) return true;
			
			// сравниваем сами таски
			for(let i = 0; i < activeTasks.length; i++)
				if(activeTasks[i] !== activeLog.tasks[i])
					return true;
				
			// если последнее логирование было больше maxInterval минут назад
			if(moment.duration(currentMoment.diff(moment(activeLog.start, "HH:mm"))).asMinutes() >= this.settings.maxInterval)
				return true;
		}
		
		// если ни одно условие не прошло - сообщаем, что не надо ничего менять
		return false;
	}
	
	update(now, remainActive): boolean {
		const activeTasks = this.data.tasks.filter(v => v.checked).map(v => v.fullname);
		if(activeTasks.length === 0)
		{
			if(this.settings.logIfNothingSelected)
				activeTasks.push(this.settings.logTextIfNothingSelected);
			else
				remainActive = false;
		}
		
		// проверяем надо ли писать новую запись лога
		if(!this.isLoggingNeeded(activeTasks, now, remainActive))
			return false;
		
		// сохраняем предыдущую запись (если она есть и открыта)
		if(this.data.log.length > 0 && !this.data.log[this.data.log.length - 1].end)
		{
			let activeLog = this.data.log.pop();
			activeLog.end = now.format("HH:mm");
			const start = moment(activeLog.start, "HH:mm");
			if(start.isAfter(now)) // на случай полночи
				start.subtract(24*60*60*1000);
			
			let durationMinutes = moment.duration(now.diff(start)).asMinutes();
			
			// если интервал слишком большой, то сокращать его до максимально допустимого 
			if(durationMinutes > this.settings.maxInterval)
				activeLog.end = start.clone().add(this.settings.maxInterval * 60*1000).format("HH:mm");
			
			//не логировать если активность была слишком короткой
			if(durationMinutes >= this.settings.minInterval)
				this.data.log.push(activeLog);
		}

		if(remainActive)
		{
			// starting new task record
			this.data.log.push({
				tasks: activeTasks,
				start: now.format("HH:mm"),
				end: false,
			});
		}
		
		this.updated = true;
		
		return true;
	}
	
	stringify() : string {
		return sectionParser.stringify(this.data);
	}
}

/**
 * записать текущую активность в лог секции
 * получает старый текст секции
 * возвращает новый, с добавленной записью лога
 **/


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
			
			// пока что это работает только для сегодняшнего дня
			const abruptExitMarks = activitySectionsParser.parseAbruptExitMarks(content);
			
			const sections = activitySectionsParser.parseDocument(content);
			if(sections)
			for(let section of sections)
			{
				const sectionObject = new sectionProcessor(
					section.inner,
					Object.assign({}, settings, section.attr || {})
				);
				
				if(abruptExitMarks)
					sectionObject.update(abruptExitMarks[0].time, false);
				
				sectionObject.update(moment(), remainActive);
				
				if(sectionObject.updated)
				{
					content = content.replace(
						section.outer,
						activitySectionsParser.stringify(Object.assign({}, section, {
							inner: sectionObject.stringify(),
						}))
					);
					updatedSectionsCount++;
				}
			}
			
			if(abruptExitMarks)
			{
				for(let mark of abruptExitMarks)
					content = content.replace(mark.outer, '');
				return content;
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
