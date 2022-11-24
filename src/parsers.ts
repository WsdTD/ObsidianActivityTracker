
export const tasks = {
	regex: /^(?<spaces>\s*)[\*\-]\s+\[(?<check>.)\](?<label>.*)$/ugm,
	parse: function(text: string) {
		let list = [];
		while((line = this.regex.exec(text.trim())) !== null) {
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
	},
	stringify: function(list: object) : string {
		let ret = [];
		for(let line of list)
			ret.push(`${"\t".repeat(line.level)}- [${line.checked ? 'x' : ' '}] ${line.label}`);
		return ret.join("\n");
	},
};
export const log = {
	regex: /^-(?<tasks>.*?;+)\s*(?<starttime>\d\d:\d\d)(-(?<endtime>\d\d:\d\d))?;(?<length>.*)$/ugm,
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
			if(line.end)
			{
				let start = moment(line.start, "HH:mm");
				let end = moment(line.end, "HH:mm");
				if(start.isSame(end)) continue;
				if(start.isAfter(end)) start.substract(24*60*60*1000);
				duration = ' ' + moment.duration(end.diff(start)).humanize();
			}
			ret.unshift(`- ${line.tasks.join('; ')}; ${line.start}${line.end ? ('-'+line.end) : ''};${duration}`);
		}
		return ret.join("\n");
	},
};
export const report = {
	generate: function(log: object, tasks: object) : string|false {
		let tasksTime = {};
		let total = 0;
		for(let line of log)
		{
			if(!line.end) continue;
			if(line.tasks.length < 1) continue;
			let start = moment(line.start, "HH:mm");
			let end = moment(line.end, "HH:mm");
			if(start.isAfter(end)) start.substract(24*60*60*1000);
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
		
		let keys = tasks.concat(Object.keys(tasksTime)).filter((v, i, o) => o.indexOf(v) === i);
		
		let ret = [];
		for(let task of keys)
		{
			let time = tasksTime[task];
			if(!time) continue;
			ret.push(`| ${task} | ${moment.duration(time).humanize()} |`);
		}
		
		if(ret.length === 0) return false;
		
		ret.push(`| | ${moment.duration(total).humanize()} |`);
		
		return `| task | duration |\n| -- | -- |\n${ret.join("\n")}`;
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
		const reportText = report.generate(section.log, section.tasks);
		if(reportText)
			ret += `\n\n<!-- report -->\n${reportText}`;
		if(logText)
			ret += `\n\n<!-- log -->\n${logText}`;
		return ret;
	},
};
export const activitySections = {
	marker: null,
	regex: null,
	init: function(marker) {
		this.marker = marker;
		this.regex = new RegExp(`<!-- ${this.marker} -->(.+?)<!-- \\/${this.marker} -->`, 'gmus');
	},
	parseDocument: function(contents:string): object|false {
		if(!this.regex) return false;
		let sectionParts;
		let ret = [];
		while((sectionParts = this.regex.exec(contents)) !== null) {
			ret.push({
				outer: sectionParts[0],
				inner: sectionParts[1],
			});
		}
		return ret;
	},
	wrapSection: function(sectionText: string): string {
		if(!this.marker) return false;
		return `<!-- ${this.marker} -->\n${sectionText}\n<!-- /${this.marker} -->`;
	},
};