import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, requestUrl } from 'obsidian';

function generateId(length: number) {
	let result = '';
	const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	const charactersLength = characters.length;
	let counter = 0;
	while (counter < length) {
		result += characters.charAt(Math.floor(Math.random() * charactersLength));
		counter += 1;
	}
	return result;
}

interface UrlImporterSettings {
	api_endpoint: string;
	api_key: string;
	folder: string;
}


const DEFAULT_SETTINGS: UrlImporterSettings = {
	api_endpoint: '',
	api_key: '',
	folder: '',
}


class UrlImporterSettingsTab extends PluginSettingTab {
	plugin: UrlImporter;

	constructor(app: App, plugin: UrlImporter) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('API Endpoint')
			.setDesc('It\'s a secret')
			.addText(text => text
				.setPlaceholder('Enter the API endpoint URL')
				.setValue(this.plugin.settings.api_endpoint)
				.onChange(async (value) => {
					this.plugin.settings.api_endpoint = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('API Key')
			.setDesc('It\'s a secret')
			.addText(text => text
				.setPlaceholder('Enter your API key')
				.setValue(this.plugin.settings.api_key)
				.onChange(async (value) => {
					this.plugin.settings.api_key = value;
					await this.plugin.saveSettings();
				}));

		// TOOD: Make this autocomplete
		new Setting(containerEl)
			.setName('Folder')
			.setDesc('The folder to save new notes')
			.addText(text => text
				.setPlaceholder('')
				.setValue(this.plugin.settings.folder)
				.onChange(async (value) => {
					this.plugin.settings.folder = value;
					await this.plugin.saveSettings();
				}));

	}
}


export default class UrlImporter extends Plugin {
	settings: UrlImporterSettings;

	async onload() {
		await this.loadSettings();

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'url-importer',
			name: 'Import URL',
			callback: () => {
				new UrlInputModal(this.app, this.settings).open();
			}
		});

		// Add a settings tab so the user can configure the plugin's settings
		this.addSettingTab(new UrlImporterSettingsTab(this.app, this));
	}

	onunload() { }

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

const ROOT = 'https://nitter.net';
const NITTER_HEADERS = {
	authority: 'nitter.net',
	accept:
		'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
	'accept-language': 'en-US,en;q=0.9',
	'cache-control': 'max-age=0',
	'sec-ch-ua': '"Google Chrome";v="119", "Chromium";v="119", "Not?A_Brand";v="24"',
	'sec-ch-ua-mobile': '?0',
	'sec-ch-ua-platform': '"Windows"',
	'sec-fetch-dest': 'document',
	'sec-fetch-mode': 'navigate',
	'sec-fetch-site': 'none',
	'sec-fetch-user': '?1',
	'upgrade-insecure-requests': '1',
	'user-agent':
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
};

class UrlInputModal extends Modal {

	constructor(app: App, private settings: UrlImporterSettings) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		const now = new Date();
		const datetimeString = now.toDateString() + " " + now.toLocaleTimeString()
		const container = contentEl.createDiv({ cls: "url-importer-container" });
		const urlInput = container.createEl("input", { placeholder: "URL", cls: "url-input" })
		const titleInput = container.createEl("input", { placeholder: "Title", cls: "title-input" })
		const authorInput = container.createEl("input", { placeholder: "Author", cls: "author-input" })
		const dateInput = container.createEl("input", { placeholder: "Date", cls: "tweet-url-input" })
		dateInput.value = datetimeString;
		const submitButton = container.createEl("button", { cls: "submit-button", text: "Import URL" });
		// urlInput.value = "https://twitter.com/lukesophinos/status/1639643315963592704";
		submitButton.addEventListener('click', async () => {
			const url = urlInput.value;
			let title: string | null = titleInput.value;
			let author: string | null = authorInput.value;
			const created = new Date(dateInput.value);
			if (title === "") {
				title = null;
			}
			if (author === "") {
				author = null;
			}
			if (url.startsWith("https://twitter.com")) {
				await this.importTweet(url);
			} else {
				await this.importUrl(title, author, created, url);
			}
			console.log("Finished!");
			this.close();
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	async importUrl(title: string | null, author: string | null, created: Date, url: string) {
		const api_url = this.settings.api_endpoint;
		const headers = {
			"x-api-key": this.settings.api_key,
		}
		// This body constructor is hacky!
		let body: any = { created: created.toISOString(), url: url };
		if (title && author) {
			body = { title: title, author: author, created: created.toISOString(), url: url };
		} else if (title) {
			body = { title: title, created: created.toISOString(), url: url };
		} else if (author) {
			body = { author: author, created: created.toISOString(), url: url };
		}

		const res = await requestUrl({ method: "POST", url: api_url, headers: headers, body: JSON.stringify(body) });
		const result = JSON.parse(res.json.body);
		const content = result.content;
		let filename = result.filename;
		if (this.settings.folder) {
			if (this.settings.folder.endsWith("/")) {
				filename = this.settings.folder + filename;
			} else {
				filename = this.settings.folder + "/" + filename;
			}
		}
		const tfile = await this.app.vault.create(filename, content);
		const leaf = this.app.workspace.getLeaf(false);
		leaf.openFile(tfile).then(() => { });
	}

	async importTweet(url: string) {
		url = url.replace('https://twitter.com', 'https://nitter.net');
		await this.getThread(url);
	}

	async getWebpages(url: string): Promise<string[] | undefined> {
		const res = await requestUrl({ url: url, headers: NITTER_HEADERS });
		if (res) {
			const parser = new DOMParser();
			const soup = parser.parseFromString(res.text, 'text/html');
			const fin = soup.querySelector('.timeline-item.thread-last');
			if (!fin) {
				const next_page = soup.querySelectorAll('a.more-replies-text').item(soup.querySelectorAll('a.more-replies-text').length - 1);
				const nextPage = next_page?.getAttribute('href')!;
				return [res.text].concat((await this.getWebpages(ROOT + nextPage)) || []);
			}
			return [res.text];
		}
	}

	async getThread(url: string) {
		let netter_url = url.replace('https://twitter.com', ROOT);
		const pages = await this.getWebpages(netter_url);
		let tweetId = (new URL(netter_url)).pathname.split("/").pop();
		if (pages) {
			let name = `Tweet - ${tweetId}.md`;
			if (tweetId === undefined) {
				tweetId = generateId(20);
				name = pages[0].match(/<div[^>]*class=["']tweet-content media-body["'][^>]*>(.*?)<\/div>/s)![1].substring(0, 20) + ".md";
			}
			if (await this.app.vault.adapter.exists(name)) {
				console.log('You already have this tweet', name);
				const leaf = this.app.workspace.getLeaf(false);
				const tfile = this.app.vault.getAbstractFileByPath(name);
				if (tfile instanceof TFile) {
					leaf.openFile(tfile).then(() => { });
				}
				return;
			} else {
				const authorMatch = pages[0].match(/<a[^>]*class=["']username["'][^>]*>(.*?)<\/a>/s);
				const author = authorMatch ? authorMatch[1] : '';
				const dateMatch = pages[0].match(/<p[^>]*class=["']tweet-published["'][^>]*>(.*?)<\/p>/s);
				let date = dateMatch ? dateMatch[1] : '';
				date = date.replace(" ·", "");
				const formattedDate = new Date(date).toLocaleDateString('en-US', {
					day: '2-digit',
					month: 'short',
					year: 'numeric',
					hour: 'numeric',
					minute: 'numeric',
					timeZoneName: 'short',
				});
				const thread = new TweetThread(this.app, url, tweetId, author, formattedDate, pages);
				await thread.extractThread();
				const tfile = await this.app.vault.create(name, thread.text);
				const leaf = this.app.workspace.getLeaf(false);
				leaf.openFile(tfile).then(() => { });
			}
		}
	}
}

class TweetThread {
	app: App;
	tweetId: string;
	text: string;
	pages: string[];
	imageUrlsToNames: Map<string, string>;

	constructor(app: App, url: string, tweetId: string, author: string, date: string, pages: string[]) {
		this.app = app;
		this.tweetId = tweetId;
		this.text = `> by ${author}\n> date: ${date}\n> link: ${url}\n\n`;
		this.pages = pages;
		this.imageUrlsToNames = new Map();
	}

	getContent(tag: Element, quote: string = '') {
		if (!quote) {
			this.text += '\n---\n';
		}

		const linksRegex = /<a[^>]*>(.*?)<\/a>/g;
		const text = tag.outerHTML.replace(linksRegex, (_, content) => {
			const match = content.match(/@|^[a-zA-Z]/);
			if (match) {
				return `**${content}**`;
			} else {
				const linkMatch = content.match(/(.*?)\((.*?)\)/);
				if (linkMatch) {
					return `[${linkMatch[1]}](${linkMatch[2]})`;
				}
			}
			return content;
		});

		this.text += `${text.replace(/\n/g, `\n${quote}`)}\n${quote}\n`;
	}

	async getMedia(path: string, kind: string, line: string, a: string, b: number | undefined = undefined) {
		if (!(await this.app.vault.adapter.exists(`assets/${this.tweetId}`))) {
			this.app.vault.createFolder(`assets/${this.tweetId}`);
		}
		const url = ROOT + path;
		const ext = path.split(a)[1].substring(0, b);
		const randId = generateId(6);
		const name = `assets/${this.tweetId}/${kind}_${randId}.${ext}`;
		if (this.imageUrlsToNames.has(name)) {
			this.text += `\n![[${name}]]\n`;
		} else {
			const res = await requestUrl({ url: url, headers: NITTER_HEADERS });
			if (res) {
				const data = res.arrayBuffer;
				const tfile = await this.app.vault.createBinary(name, data);
				this.text += `\n![[${name}]]\n`;
			} else {
				this.text += `Missing : ${url}\n`;
			}
		}
	}

	checkIfQuoted(tag: string) {
		const parents = tag.match(/<div[^>]*class=["']quote-media-container|quote-text["'][^>]*>/);
		if (parents) {
			this.text += '>';
		}
	}

	async extractThread() {
		let className = 'main-thread';
		for (let index = 0; index < this.pages.length; index++) {
			const page = this.pages[index];
			if (index > 0) {
				className = 'after-tweet thread-line';
			}
			const parser = new DOMParser();
			const html = parser.parseFromString(page, 'text/html');
			// const tweets = page.match(new RegExp(`<div[^>]*class=["']${className}["'][^>]*>.*?<\/div>`, 'gs'));
			const tweets = html.querySelectorAll("." + className)
			const tweetStrings: string[] = [];
			tweets.forEach((tweet: Element) => {
				tweetStrings.push(tweet.outerHTML);
			});
			if (tweetStrings.length > 0) {
				const combinedTweetsHtml = parser.parseFromString(tweetStrings.join("\n"), 'text/html');
				const tags = combinedTweetsHtml.querySelectorAll("div .tweet-content.media-body, div .still-image, div .attachment, div .card-content, div .quote, div .card-image, div video");
				for (let i = 0; i < tags.length; i++) {
					const tag: Element = tags[i];
					// console.log("tag:", tag);
					if (tag.classList.contains("tweet-content")) {
						this.text += tag.textContent + "\n\n\n";
					}
					if (tag.classList.contains('card-content')) {
						this.text += tag.textContent + "\n\n\n";
					}
					if (tag.classList.contains('quote')) {
						console.warn(tag);
						let dateMatch = tag.querySelector("div.tweet-name-row span.tweet-date")?.getAttr("title");
						if (dateMatch) {
							dateMatch = dateMatch.replace(" ·", "");
						}
						console.warn(dateMatch);
						const date = dateMatch ? dateMatch[1] : '';
						console.warn(date);
						const formattedDate = new Date(date).toLocaleDateString('en-US', {
							day: '2-digit',
							month: '2-digit',
							year: 'numeric',
						});
						console.warn(formattedDate);
						const writerMatch = tag.querySelector("div.tweet-name-row div.fullname-and-username a.username")?.textContent;
						const writer = writerMatch ? writerMatch[1] : '';
						const urlMatch = tag.querySelector("a")?.href;
						const url = urlMatch ? ROOT + urlMatch[1] : '';
						this.text += `\n>[**${writer}**  ${formattedDate}](${url})  \n`;
						this.getContent(tag, '>');
					}
					if (tag.classList.contains('still-image')) {
						this.checkIfQuoted(tag.outerHTML);
						await this.getMedia(tag.outerHTML.match(/href=["'](.*?)["']/)![1], 'image', '{}', '.', 3);
					}
					if (tag.classList.contains('card-image')) {
						const parentMatch = tag.querySelector("a")?.href;
						const parent = parentMatch ? parentMatch[1] : '';
						await this.getMedia(
							tag.querySelector("img")?.src!,
							'image',
							`[![image]({{}})](${parent})`,
							'format%3D',
							3
						);
					}
					if (tag instanceof HTMLVideoElement) {
						await this.getMedia(tag.src!, 'video', '![video]({})', '.', 3);
					}
				};
			}
		};
		this.text += '\n\n';
	}
}

// const url = 'https://twitter.com/lukesophinos/status/1639643315963592704';