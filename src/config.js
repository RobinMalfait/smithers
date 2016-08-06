import fs from 'fs';
import {remote} from 'electron';
import _ from 'lodash';

const {app} = remote;
const CONFIG_PATH = app.getPath("userData") + "/user.config.json";

class Config {
  constructor() {
    this.config = this.loadConfig();
  }

  defaultConfig() {
    return {
      plugins: {
        local: [],
        external: []
      },
    };
  }

  get(key, defaultValue) {
    return _.get(this.config, key, defaultValue);
  }

  set(key, value) {
    this.config = _.set(this.config, key, value);
    this.persist();
  }

  getConfigPath() {
    return CONFIG_PATH;
  }

  loadConfig() {
    if (fs.existsSync(CONFIG_PATH)) {
      const config = fs.readFileSync(CONFIG_PATH, 'utf8');
      try {
        return JSON.parse(config);
      } catch(e) {
        console.error(`ERROR\n  Could not load config file (${CONFIG_PATH})\n  Check the file, and see what's going on`);
        Robot.notify(`Could not load config file`);
        return this.defaultConfig();
      }
    }

    fs.writeFile(CONFIG_PATH, JSON.stringify(this.defaultConfig(), null, '  '));
    return this.defaultConfig();
  }

  persist() {
    fs.writeFile(CONFIG_PATH, JSON.stringify(this.config, null, '  '));
  }
}

export default new Config();