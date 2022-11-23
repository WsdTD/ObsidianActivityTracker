import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, moment} from 'obsidian';
import { WsdActivitySettings, DEFAULT_SETTINGS } from './settings.ts' ;
import {writeLogRecord} from './logger.ts';


export default class WsdActivity extends Plugin {
	
	settings: WsdActivitySettings;
	
	ribbonIcon: null;
	statusBarText: null;
	interval: null;
	lastUpdate: null;
	
	writeLogRecord(remainActive: boolean): Promise<void> {
		this.statusBarText.setText('AT: saving');
		console.log('Activity log check');
		return writeLogRecord(this, remainActive)
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
		this.writeLogRecord(true);
		this.interval = setInterval(() => {
			this.writeLogRecord(true);
		}, 60000);
		this.lastUpdate = moment();
		this.registerInterval(this.interval);
		new Notice('Activity tracker started');
		console.log('Activity tracker started');
	}
	
	pause() {
		if(!this.interval) return;
		clearInterval(this.interval);
		this.interval = null;
		this.writeLogRecord(false);
		new Notice('Activity tracker paused');
		console.log('Activity tracker paused');
	}

	async onload() {
		await this.loadSettings();
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
			this.statusBarText.setText(`AT: ${String(d.hours()).padStart(2, "0")}:${String(d.minutes()).padStart(2, "0")}:${String(d.seconds()).padStart(2, "0")}`);
		}, 1000));
		
		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		this.statusBarText = this.addStatusBarItem();
		this.statusBarText.setText('AT: idle');

		// this.addSettingTab(new WsdActivitySettingTab(this.app, this));
	}

	onunload() {
		this.pause();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}