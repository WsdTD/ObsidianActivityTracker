import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import WsdActivity from './main.ts';

export interface WsdActivitySettings {
	maxInterval: number;
	minInterval: number;
	shortBreak: number;
	longBreak: number;
	longBreakInterval: number;
	autostartTimer: boolean;
	trackerLabel: string;
}

export const DEFAULT_SETTINGS: WsdActivitySettings = {
	maxInterval: 25,
	minInterval: 4,
	shortBreak: 5,
	longBreak: 20,
	longBreakInterval: 4,
	autostartTimer: false,
	trackerLabel: "activity tracker",
}


export class WsdActivitySettingTab extends PluginSettingTab {
	plugin: WsdActivity;
	
	addNumberSetting(containerEl, config) {
		let setting = new Setting(containerEl)
			.setName(config.name)
			.addText(input => input
				.setValue(String(this.plugin.settings[config.code]))
				.onChange(value => {
					value = Number(value);
					if(!isNaN(value) && value > 0)
					{
						this.plugin.settings[config.code] = value;
					}
					else
					{
						new Notice("Please specify a valid number.");
						this.plugin.settings[config.code] = DEFAULT_SETTINGS[config.code];
					}
					this.plugin.saveSettings();
				})
			);
		if(config.desc)
			setting.setDesc(config.desc);
		return setting;
	}

	constructor(app: App, plugin: WsdActivity) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();
		containerEl.createEl('h2', {text: 'Activity Tracker'});
		
		this.addNumberSetting(containerEl, {
			code: 'maxInterval',
			name: 'Maximum time for logging (minutes)',
			desc: "intervals bigger than this will be separated in logs",
		});
		this.addNumberSetting(containerEl, {
			code: 'minInterval',
			name: 'Minimum time for logging (minutes)',
			desc: "intervals less than this won't be logged",
		});
		
		new Setting(containerEl)
			.setName("Autostart timer")
			.setDesc("Start timer on vault open")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autostartTimer)
				.onChange(value => {
					this.plugin.settings.autostartTimer = value;
					this.plugin.saveSettings()
						.then(() => this.display()) //force refresh
				}));
		
		// this.addNumberSetting(containerEl, {
			// code: 'shortBreak',
			// name: 'Short break time (minutes)',
			// desc: "this will be added after every full interval",
		// });
		// this.addNumberSetting(containerEl, {
			// code: 'longBreak',
			// name: 'Long break time (minutes)',
			// desc: "this will replace short breaks once in a while",
		// });
		// this.addNumberSetting(containerEl, {
			// code: 'longBreakInterval',
			// name: 'Long break interval',
			// desc: "Number of full intervals before a long break",
		// });
		
		
		
		new Setting(containerEl)
			.setName("Section Marker")
			.setDesc("This text as a part of HTML comment will mark the main secrion of tracker")
			.addText(input => input
				.setValue(String(this.plugin.settings.trackerLabel))
				.onChange(value => {
					value = String(value).trim();
					if(value.length > 0)
					{
						this.plugin.settings.trackerLabel = value;
					}
					else
					{
						new Notice("Please specify a valid non empty string.");
						this.plugin.settings.trackerLabel = DEFAULT_SETTINGS.trackerLabel;
					}
					this.plugin.saveSettings();
				})
			);
	}
}