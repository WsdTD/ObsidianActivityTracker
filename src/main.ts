import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, moment} from 'obsidian';
import { getDailyNote, createDailyNote, getAllDailyNotes, appHasDailyNotesPluginLoaded } from 'obsidian-daily-notes-interface';
import { WsdActivitySettings, DEFAULT_SETTINGS, WsdActivitySettingTab } from './settings.ts' ;
import {processLogRecordsInFile} from './logger.ts';

function getDailyNoteFile(): Promise<TFile> {
	if(!appHasDailyNotesPluginLoaded()) return Promise.reject("daily notes plugin is not enabled");
	const file = getDailyNote(moment(), getAllDailyNotes());
	if(file) return Promise.resolve(file);
	return createDailyNote(moment());
}

export default class WsdActivity extends Plugin {
	
	settings: WsdActivitySettings;
	
	ribbonIcon: null;
	statusBarText: null;
	interval: null;
	lastUpdate: null;
	currentFile: null;
	
	writeLogRecord(remainActive: boolean): Promise<void> {
		if(!this.currentFile) return Promise.reject("filename is not set");
		this.statusBarText.setText('AT: saving');
		return processLogRecordsInFile(this.app, this.currentFile, remainActive, this.settings)
			.catch(error => console.log(error))
			.then(updated => {
				this.statusBarText.setText(`AT: ${this.interval ? 'rec' : 'idle'}`);
				if(updated)
				{
					this.lastUpdate = moment();
					new Notice('Activity logged');
					console.log('Activity logged');
				}
			});
	}
	
	play() {
		if(this.interval) return;
		
		getDailyNoteFile().then(file => {
			this.currentFile = file;
			this.writeLogRecord(true);
			this.interval = setInterval(() => {
				this.writeLogRecord(true);
			}, 60000);
			this.lastUpdate = moment();
			this.registerInterval(this.interval);
			new Notice('Activity tracker started');
			console.log('Activity tracker started');
		});
	}
	
	pause() {
		if(!this.interval) return;
		clearInterval(this.interval);
		this.interval = null;
		this.writeLogRecord(false);
		this.currentFile = null;
		new Notice('Activity tracker paused');
		console.log('Activity tracker paused');
	}

	onload() {
		this.loadSettings().then(() => {
			this.ribbonIcon = this.addRibbonIcon('clock', 'Activity Tracker', (evt: MouseEvent) => {
				if(this.interval)
					this.pause();
				else
					this.play();
			});
			
			this.registerInterval(setInterval(() => {
				if(!this.interval)
					return this.statusBarText.setText('AT: idle');
				if(!this.lastUpdate)
					return this.statusBarText.setText('AT: set');
				const d = moment.duration(moment().diff(this.lastUpdate));
				this.statusBarText.setText(`AT: ${String(Math.floor(d.asMinutes())).padStart(2, "0")}:${String(d.seconds()).padStart(2, "0")}`);
			}, 1000));
			
			// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
			this.statusBarText = this.addStatusBarItem();
			this.statusBarText.setText('AT: idle');

			this.addSettingTab(new WsdActivitySettingTab(this.app, this));
			
			if(this.settings.autostartTimer)
				setTimeout(() => this.play(), 1000);
		});
	}

	onunload() {
		this.pause();
	}

	loadSettings() {
		return this.loadData().then(data => this.settings = Object.assign({}, DEFAULT_SETTINGS, data));
	}

	saveSettings() {
		return this.saveData(this.settings);
	}
}