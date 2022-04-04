/**
 * A simple script to build docs for all the modules and commands
 * under modules/*.
 */

const fs = require('fs')
const path = require('path')
const dot = require('graphlib-dot')
const {
    listArchives,
    allRecognizablePhrases,
    automataToImage
} = require('./build-utils')

const listFiles = (_path, filter) => listArchives('FILES')(_path, filter)
const listFolders = (_path, filter) => listArchives('FOLDER')(_path, filter)

async function main() {
    const spoken = new SpokenModules()

    for (const moduleA of spoken.modules) {
        for (const command of moduleA.commands) {
            for (const automata of command.automatas) {
                await automataToImage(automata.path, automata.image)

                const graph = dot.read(fs.readFileSync(automata.path, 'utf-8'))
                const { lang, title, desc, langName } = graph.graph()

                automata.phrases = allRecognizablePhrases(graph, spoken.templates).slice(0, 16)
                automata.title = title
                automata.desc = desc
                automata.langName = langName
                automata.lang = lang
            }

            fs.writeFileSync(command.readme, command.buildReadme())
        }

        moduleA.buildGraph()

        await automataToImage(moduleA.automata, moduleA.image)

        fs.writeFileSync(moduleA.readme, moduleA.buildReadme())
    }
}

class SpokenModules {
    constructor() {
        this.root = path.resolve(__dirname, '..', 'modules')
        this.modules = listFolders(this.root).map(name => new SpokenModule(name))
        this.templates = {}
        this.addTemplates(path.resolve(this.root, '__meta', 'default-templates.json'))
    }

    addTemplates(filePath) {
        const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'))

        this.templates = { ...this.templates, ...content }
    }
}

class SpokenModule {
    constructor(name) {
        this.name = name
        this.root = path.resolve(__dirname, '..', 'modules', name)
        this.readme = path.resolve(this.root, 'README.md')
        this.image = path.resolve(this.root, this.name + '.png')
        this.relativeImagePath = this.name + '.png'
        this.automata = path.resolve(this.root, this.name + '.dot')
        this.commands = listArchives('FOLDER')(this.root).map(name1 => new Command(name1, this.root))
    }

    buildReadme() {
        const graph = dot.read(fs.readFileSync(this.automata, 'utf-8')).graph()
        const text = []

        text.push('# ' + graph.label)
        text.push(graph.desc)
        text.push('![' + this.name + '](' + this.relativeImagePath + ')')
        text.push('---')

        for (const command of this.commands) {
            for (const automata of command.automatas) {
                automata.relativeImagePath = command.name + '/' + automata.relativeImagePath
            }
        }

        text.push(...this.commands.map(i => i.buildReadme()).map(a => a + '\n\n---'))

        return text.join('\n\n')
    }

    buildGraph() {
        const lines = fs.readFileSync(this.automata, 'utf-8').split('\n')
        const begin = lines.findIndex(a => a.trim().startsWith('// START GENERATED'))
        const end = lines.findIndex(a => a.trim().startsWith('// END GENERATED'))

        if (end === -1 || begin === -1 || begin > end) {
            console.warn('Could not mount module documentation')
            return
        }

        const newLines = this.commands.map((item, index) => `    0 -> ${(index + 1)} [label="(${item.name})"];`)

        const a = lines.slice(0, begin + 1)
        const b = lines.slice(end)
        const c = a.concat(newLines).concat(b).join('\n')

        fs.writeFileSync(this.automata, c)
    }
}

class Command {
    constructor(name, dir) {
        this.name = name
        this.root = path.resolve(dir, name)
        this.readme = path.resolve(this.root, 'README.md')
        this.code = fs.readFileSync(path.resolve(this.root, 'impl.ts'), 'utf-8')
        this.automatas = this.#getCommandAutomatas(this.root)
    }

    #getCommandAutomatas(root) {
        let ats = listFiles(root, a => a.startsWith('phrase_') && a.endsWith('.dot'))

        return ats.map(item => ({
            path: path.resolve(root, item),
            image: path.resolve(root, item).replace(/.dot/gi, '.png'),
            relativeImagePath: item.replace(/.dot/gi, '.png')
        }))
    }

    buildReadme() {
        const text = []
        const autom = this.automatas.find(item => item.lang === 'en-US')
    
        const push = (s) => {
            text.push(s)

            return text
        }
    
        push('## ' + autom.title)
        push(autom.desc)
        push('### Languages')
        push('This command is available in the following languages')
        push(this.buildLangSection())
        push('### Implementation')
        push('The full implementation of this command can be found on this directory under the file [impl.ts](impl.ts)')
        push('```typescript\n' + this.code.substr(0, 300))
        push('(...)\n```')
    
        return text.join('\n\n')
    }

    buildLangSection() {
        let text = []
    
        for (const automata of this.automatas) { 
            text.push('#### ' + automata.langName)
            text.push(i18n[automata.lang].automata(automata.title))
            text.push(`![${automata.langName}](${automata.relativeImagePath})`)
            text.push(i18n[automata.lang].phrases(automata.title))
    
            text.push(automata.phrases.map((item, index) => (index + 1) + '. ' + item).join('\n'))
        }
    
        return text.join('\n\n')
    }
}

const i18n = {
    'en-US': {
        automata: (cName) => `The following automata is responsible for recognizing the command \`${cName}\` in english:`,
        phrases: (cName) => `The following are some examples of phrases, in english, used to trigger the command \`${cName}\`:`
    },
    'pt-BR': {
        automata: (cName) => `O automata seguinte é reponsável por reconhecer o comando \`${cName}\` em português:`,
        phrases: (cName) => `Os seguintes exemplos de frases, em português, podem ser usadas para ativar o comando \`${cName}\`:`
    }
}

main()