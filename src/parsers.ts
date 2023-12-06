import {moment} from 'obsidian';

export const tasks = {
	regex: /^(?<spaces>\s*)[\*\-]\s+\[(?<check>.)\](?<label>.*)$/ugm,
	parse: function(text: string) {
		let list = [];
		while((line = this.regex.exec(text.trim())) !== null) {
			let spaces = line.groups.spaces.replace(/ {4}/g, '\t').replace(/ +/g, '\t');
			let item = {
				checked: line.groups.check !== ' ',
				label: line.groups.label.trim().replace(/;/g, '.,'),
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
	},
	stringify: function(list: object) : string {
		let ret = [];
		for(let line of list)
			ret.push(`${"\t".repeat(line.level)}- [${line.checked ? 'x' : ' '}] ${line.label}`);
		return ret.join("\n");
	},
};
export const log = {
	regex: /^-\s*(?<starttime>\d\d:\d\d)(-(?<endtime>\d\d:\d\d).*?)?;(?<tasks>.*)$/gmu,
	parse: function(text: string) {
		let list = [];
		while((line = this.regex.exec(text)) !== null) {
			list.unshift({
				tasks: line.groups.tasks.split(';').map(v => v.trim()).filter(v => v),
				start: line.groups.starttime,
				end: line.groups.endtime || null,
			});
		}
		return list;
	},
	stringify: function(list: object): string {
		let ret = [];
		for(let line of list)
		{
			let duration = '';
			let string = `- ${line.start}`;
			if(line.end)
			{
				let start = moment(line.start, "HH:mm");
				let end = moment(line.end, "HH:mm");
				if(start.isSame(end)) continue;
				if(start.isAfter(end)) start.subtract(24*60*60*1000);
				duration = moment.duration(end.diff(start)).humanize();
				string += `-${line.end} (${duration})`;
			}
			string += `; ${line.tasks.join('; ')}`;
			ret.unshift(string);
		}
		return ret.join("\n");
	},
};
export const report = {
	
	timeString(v:integer) {
		if(v > 9) return String(v);
		return `0${v}`;
	},
	
	reportLine: function(label, time) {
		const d = moment.duration(time);
		return `| ${label} | ${d.humanize()} | ${this.timeString(d.hours())}:${this.timeString(d.minutes())} |`
	},
	
	generate: function(log: object) : string|false {
				
		let tasksTime = {};
		let total = 0;
		for(let line of log)
		{
			if(!line.end) continue;
			if(line.tasks.length < 1) continue;
			let start = moment(line.start, "HH:mm");
			let end = moment(line.end, "HH:mm");
			if(start.isAfter(end)) start.subtract(24*60*60*1000);
			let length = end - start;
			total += length;
			if(line.tasks.length > 0)
				length /= line.tasks.length;
			for(let task of line.tasks)
			{
				if(!tasksTime[task]) tasksTime[task] = 0;
				tasksTime[task] += length;
			}
		}
		
		if(total === 0) return false;
		
		let ret = Object.entries(tasksTime)
			.sort((a,b) => b[1] - a[1])
			.map(t => this.reportLine(t[0], t[1]))
			
		ret.push(this.reportLine('', total))
		
		return `| task | aprox | exact |\n| -- | -- | -- |\n${ret.join("\n")}`;
	},
};
export const section = {
	regex: /^(?<tasks>.*?)(<!-- report -->(?<report>.*?))?(<!-- log -->(?<log>.*?))?$/us,
	parse: function(text: string) : object|false {
		parts = this.regex.exec(text);
		if(!parts) return false;
		return {
			tasks: tasks.parse(parts.groups.tasks),
			log: parts.groups.log ? log.parse(parts.groups.log) : [],
			report: parts.groups.report || null,
		};
	},
	stringify: function(section: object): string {
		let ret = tasks.stringify(section.tasks);
		if(!section.log) return ret;
		const logText = log.stringify(section.log);
		const reportText = report.generate(section.log);
		if(reportText)
			ret += `\n\n#### report\n<!-- report -->\n\n${reportText}`;
		if(logText)
			ret += `\n\n#### log\n<!-- log -->\n${logText}`;
		return ret;
	},
};
export const activitySections = {
	marker: null,
	regex: null,
	abruptRegex: /<!-- abrupt exit (\d\d:\d\d)\s*-->/gmus,
	attrRegex: /(\w+)=(\S+)/gs,
	init: function(marker) {
		this.marker = marker;
		this.regex = new RegExp(`<!-- ${this.marker} (.*?)-->(.+?)<!-- \\/${this.marker} -->`, 'gmus');
	},
	initialized: function() {
		return this.marker && this.regex;
	},
	parseAttr: function(attrString: string|null): object|null {
		if(!attrString) return null;
		let ret = {};
		while((attrParts = this.attrRegex.exec(attrString)) !== null) {
			try {
				ret[attrParts[1]] = JSON.parse(attrParts[2]);
			}
			catch(e) {
				console.log("invalid configuration:", attrParts);
			}
		}
		if(typeof ret.maxInterval !== 'number')
			ret.maxInterval = 24*60; // без прерываний, целый день
		
		if(typeof ret.minInterval !== 'number')
			delete ret.minInterval; // загрузить из дефолтных настроек
		
		// @todo: проверка остальных свойств
		return ret;
	},
	parseDocument: function(contents:string): object|false {
		if(!this.regex) return false;
		let sectionParts;
		let ret = [];
		while((sectionParts = this.regex.exec(contents)) !== null) {
			ret.push({
				outer: sectionParts[0],
				attr: this.parseAttr(sectionParts[1]),
				attrText: sectionParts[1],
				inner: sectionParts[2],
			});
		}
		return ret;
	},
	stringify: function(section) {
		if(!this.marker) return false;
		let ret = `<!-- ${this.marker} ${section.attrText}-->\n${section.inner}\n<!-- /${this.marker} -->`;
		return ret;
	},
	parseAbruptExitMarks: function(contents:string): object|false {
		if(!this.abruptRegex) return false;
		let m;
		let ret = [];
		while((m = this.abruptRegex.exec(contents)) !== null) {
			ret.push({
				outer: m[0],
				time: moment(m[1], "HH:mm"),
			});
		}
		if(ret.length === 0) return false;
		return ret;
	},
};