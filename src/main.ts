import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting} from 'obsidian';
import { WsdActivitySettings, DEFAULT_SETTINGS } from './settings.ts' ;
import {writeLogRecord} from './logger.ts';


export default class WsdActivity extends Plugin {
	
	settings: WsdActivitySettings;
	
	ribbonIcon: null;
	statusBarText: null;

	async onload() {
		await this.loadSettings();

		// This creates an icon in the left ribbon.
		this.ribbonIcon = this.addRibbonIcon('dice', 'Activity Tracker', (evt: MouseEvent) => {
			// @todo: пуск/остановка таймера
		
			// Called when the user clicks the icon.
			new Notice('This is a notice! 111 123');
			
			this.statusBarText.setText('AT: clicked');
			
			writeLogRecord().catch(error => console.log(error))
			
				
            // yield this.appendFile(file, logText);
			
			// access aplication
			// this.app
			
			
		});
		// Perform additional things with the ribbon
		// this.ribbonIcon.addClass('my-plugin-ribbon-class');

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		this.statusBarText = this.addStatusBarItem();
		this.statusBarText.setText('AT: idle');
		// @todo: в статусбаре выводить состояние текущей операции
		
		
		
		
		
		/*
		
		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'open-sample-modal-simple',
			name: 'Open sample modal (simple)',
			callback: () => {
				new SampleModal(this.app).open();
			}
		});
		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: 'sample-editor-command',
			name: 'Sample editor command',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				console.log(editor.getSelection());
				editor.replaceSelection('Sample Editor Command');
			}
		});
		// This adds a complex command that can check whether the current state of the app allows execution of the command
		this.addCommand({
			id: 'open-sample-modal-complex',
			name: 'Open sample modal (complex)',
			checkCallback: (checking: boolean) => {
				// Conditions to check
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					// If checking is true, we're simply "checking" if the command can be run.
					// If checking is false, then we want to actually perform the operation.
					if (!checking) {
						new SampleModal(this.app).open();
					}

					// This command will only show up in Command Palette when the check function returns true
					return true;
				}
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new WsdActivitySettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
			console.log('click', evt);
		});

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
		
		*/
	}

	onunload() {
		// @todo: записывать после
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
/*
class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}
*/