import fs from 'fs'
import {resolve} from 'path'
import config from 'config'
import mkdirp from 'mkdirp'
import {exec} from 'child_process'
import rimraf from 'rimraf'
import {EXTERNAL_PLUGIN} from './sources'
import Plugin from './Plugin'
import Event, {PLUGIN_INSTALLING, PLUGIN_INSTALLED, PLUGIN_DELETING, PLUGIN_DELETED} from 'Event'

class PluginManager {

  constructor () {
    this.cards = []
    this.plugins = []
  }

  syncExternalPlugins () {
    const externalPlugins = config.get('plugins.external')
    const externalPluginModuleNames = config.get('plugins.external').map(module => {
      const [moduleName] = module.split('@')
      return moduleName
    })
    const basePath = config.getExternalPluginsPath()

    externalPlugins.forEach((module) => {
      const [moduleName] = module.split('@')
      const path = resolve(basePath, moduleName)

      if (!fs.existsSync(path)) {
        this._installExternalPlugin(path, moduleName, module)
      }
    })

    fs.readdir(config.getExternalPluginsPath(), (err, files) => {
      if (err) {
        // TODO : handle err
        console.error(err)
      }
      files.filter(plugin => !externalPluginModuleNames.includes(plugin))
        .map((moduleName) => this._uninstallExternalPlugin(resolve(basePath, moduleName), moduleName))
    })
  }

  _uninstallExternalPlugin (path, moduleName) {
    Event.fire(PLUGIN_DELETING, {
      module: moduleName
    })

    rimraf(path, (err) => {
      if (err) {
        console.log('Could not delete module')
      }

      Event.fire(PLUGIN_DELETED, {
        module: moduleName
      })
    })
  }

  _installExternalPlugin (path, moduleName, module) {
    Event.fire(PLUGIN_INSTALLING, {
      module: moduleName
    })

    mkdirp(path, () => {
      const packageJsonPath = resolve(path, 'package.json')

      fs.writeFile(packageJsonPath, JSON.stringify({
        name: `plugin-${moduleName}`,
        dependencies: {},
        private: true
      }, null, '  '), (err) => {
        if (err) {
          console.error(`Could not install ${moduleName}`)
          return
        }

        exec(`npm install ${module} --production --save`, {
          cwd: path
        }, (err, stdout, stderr) => {
          if (err || stderr) {
            console.error(`Could not install ${moduleName}`)
          }

          fs.writeFile(resolve(path, 'index.js'), [
            `var obj = require('${moduleName}');`,
            'module.exports = obj && obj.__esModule ? obj : { default: obj };'
          ].join('\n\n'), (err) => {
            if (err) {
              // TODO : handle err
              console.error(err)
            }

            exec('npm list --json --depth=0', {
              cwd: path
            }, (err, stdout, stderr) => {
              if (err) {
                console.error(`Could not read version of ${moduleName}`)
              }

              const info = JSON.parse(stdout)

              Object.keys(info.dependencies).forEach(dependency => {
                if (dependency === moduleName) {
                  const contents = window.require(packageJsonPath)
                  contents.version = info.dependencies[dependency].version

                  fs.writeFileSync(packageJsonPath, JSON.stringify(contents, null, '  '))
                }
              })

              const plugin = {
                name: moduleName,
                location: path,
                version: window.require(packageJsonPath).version,
                source: EXTERNAL_PLUGIN
              }

              this.register(plugin, this.loadPlugin(plugin.location))

              Event.fire(PLUGIN_INSTALLED, {
                module: moduleName
              })
            })
          })
        })
      })
    })
  }

  checkForUpdates () {
    // npm outdated --json
  }

  removeExternalPlugin (module) {
    let plugins = config.get('plugins.external')

    config.set('plugins.external', plugins.map((plugin) => {
      let [moduleName] = plugin.split('@')
      return moduleName === module.name ? undefined : plugin
    }).filter(x => !!x))

    this.plugins = this.plugins.map(plugin => {
      if (plugin.location === module.location) {
        return null
      }

      return plugin
    }).filter(x => !!x)
  }

  addExternalPlugin (module) {
    const [moduleName] = module.split('@')
    let plugins = config.get('plugins.external')

    if (plugins.includes(module)) {
      return undefined
    }

    plugins.push(module)
    config.set('plugins.external', plugins)

    return moduleName
  }

  removeLocalPlugin ({location}) {
    let installedPlugins = config.get('plugins.local')

    installedPlugins = installedPlugins.map(plugin => {
      if (plugin.location === location) {
        return null
      }

      return plugin
    }).filter(x => !!x)

    this.plugins = this.plugins.map(plugin => {
      if (plugin.location === location) {
        return null
      }

      return plugin
    }).filter(x => !!x)

    config.set('plugins.local', installedPlugins)
  }

  loadPlugin (path) {
    try {
      return window.require(resolve(path))
    } catch (err) {
      console.error(err)
      return null
    }
  }

  register (info, cb) {
    if (!cb) {
      console.error([
        'COULD NOT LOAD PLUGIN',
        `name: ${info.name}`,
        `version: ${info.version}`
      ].join('\n  '))
      return
    }

    if ('default' in cb) {
      cb = cb.default
    }

    this.plugins = [
      ...this.plugins,
      new Plugin(info, cb)
    ]
  }

  execute (command) {
    this.plugins.forEach(plugin => plugin.execute(command))
  }

  registerComponent (component, name) {
    this.cards = [
      ...this.cards,
      {
        component,
        name
      }
    ]
  }

  resolveComponent (name) {
    try {
      const card = this.cards.find(c => c.name === name)
      if (card) {
        return card.component
      }

      return undefined
    } catch (err) {
      console.error(`The plugin '${name}' could not be loaded.`)
      return undefined
    }
  }

  list () {
    return this.plugins
  }
}

export default new PluginManager()
