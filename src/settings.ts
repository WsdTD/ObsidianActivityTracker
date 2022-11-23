import WsdActivity from './main.ts';

export interface WsdActivitySettings {
	mySetting: string;
}

export const DEFAULT_SETTINGS: WsdActivitySettings = {
	mySetting: 'default'
}


/*
export class WsdActivitySettingTab extends PluginSettingTab {
	plugin: WsdActivity;

	constructor(app: App, plugin: WsdActivity) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Settings for my awesome plugin.'});

		new Setting(containerEl)
			.setName('Setting #1')
			.setDesc('It\'s a secret')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.mySetting)
				.onChange(async (value) => {
					console.log('Secret: ' + value);
					this.plugin.settings.mySetting = value;
					await this.plugin.saveSettings();
				}));
	}
}
/**/