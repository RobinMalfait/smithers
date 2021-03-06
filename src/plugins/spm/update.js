import React from 'react'
import semver from 'semver'

import {EXTERNAL_PLUGIN} from 'pluginSystem/sources'
import preUpdateSteps from './preUpdateSteps'
import postUpdateSteps from './postUpdateSteps'

import stepper from './stepper'

import {enhance, restorableComponent} from 'components/functions'

const UPDATE_COMPONENT = 'com.robinmalfait.spm.update'
const UPDATE_AVAILABLE_COMPONENT = 'com.robinmalfait.spm.update_available'

const UPDATE_INTERVAL = 5 // 5 minutes

export default robot => {
  const {Blank} = robot.cards
  const {Icon, theme, color} = robot.UI
  const {FlatButton, RaisedButton} = robot.UI.material

  const Stepper = stepper(robot, [
    ...preUpdateSteps,
    ...postUpdateSteps
  ])

  class Update extends React.Component {
    state = {
      done: this.props.done,
      state: {}
    };

    markAsDone = (state) => {
      this.setState({ done: true, state })
    };

    render () {
      let {plugin, ...other} = this.props

      return (
        <Blank
          {...other}
          title={`Updating ${plugin}`}
        >
          <Stepper
            done={this.state.done}
            state={this.state.state}
            title={<span>Updating <em>{plugin.split(/[ /]/g).filter(x => !!x).pop()}</em></span>}
            plugin={plugin}
            onFinished={(state) => {
              if (window.confirm('Plugin has been updated, restart for the best experience')) {
                setTimeout(() => {
                  window.location.reload()
                }, 1500)
              }
              this.markAsDone(state)
            }}
            onFailed={(state) => this.markAsDone(state)}
          />
        </Blank>
      )
    }
  }

  class UpdateAvailable extends React.Component {
    render () {
      let {plugin, version, ...other} = this.props

      return (
        <Blank
          {...other}
          title={`Update available for ${plugin.name}!`}
        >
          <h1 style={{
            textAlign: 'center',
            paddingTop: 100,
            paddingBottom: 100
          }}>{plugin.version} <Icon icon='angle-double-right' /> {version}</h1>

          <div className='right'>
            <FlatButton
              onClick={other.removeCard}
              label='Ignore'
            />
            <RaisedButton
              onClick={() => {
                robot.execute(`update ${plugin.name}`)
                other.removeCard()
              }}
              backgroundColor={color(theme.primaryColor)}
              labelColor={color('grey', 50)}
              label='Update'
            />
          </div>
        </Blank>
      )
    }
  }

  robot.registerComponent(enhance(Update, [
    restorableComponent
  ]), UPDATE_COMPONENT)
  robot.registerComponent(UpdateAvailable, UPDATE_AVAILABLE_COMPONENT)

  robot.listen(/^update (.*)$/, {
    description: 'update a plugin. these plugins will only be npm remote plugins.',
    usage: 'update <plugin>',
    args: {
      plugin: () => {
        return robot.plugins().filter(plugin => [EXTERNAL_PLUGIN].includes(plugin.source)).map(plugin => plugin.name)
      }
    }
  }, (res) => {
    const {plugin} = res.matches

    robot.addCard(UPDATE_COMPONENT, {plugin})
  })

  const checkRegistry = (plugin) => {
    return robot.fetchJson(`http://registry.npmjs.org/${plugin.name}/latest`)
      .then((result) => {
        if (result.error) {
          console.log(result.error)
          return
        }

        if (semver.gt(result.version, plugin.version)) {
          const cardExist = robot.getCardsByIdentifier(UPDATE_AVAILABLE_COMPONENT)
            .filter(card => card.props.plugin.name === plugin.name)
            .length > 0

          // Only show 1 update card per plugin
          if (!cardExist) {
            robot.addCard(UPDATE_AVAILABLE_COMPONENT, {
              plugin,
              version: result.version
            })
          }

          return true
        }

        return false
      })
  }

  const checkForUpdates = () => {
    return robot.plugins()
      .filter(plugin => [EXTERNAL_PLUGIN].includes(plugin.source))
      .map(plugin => checkRegistry(plugin))
  }

  setTimeout(() => {
    checkForUpdates()

    setInterval(() => {
      checkForUpdates()
    }, UPDATE_INTERVAL * 60 * 1000)
  })

  robot.listen(/^check for updates$/, {
    description: 'check if there are any updates for plugins.',
    usage: 'check for updates'
  }, () => {
    Promise.all(checkForUpdates())
      .then((values) => {
        robot.notify(
          values.some(hasUpdate => hasUpdate === true)
            ? 'There are some updates available'
            : 'There are no plugins that need to be updated'
        )
      })
  })
}
