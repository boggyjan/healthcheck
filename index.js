import fs from 'fs'
import express from 'express'
import bodyParser from 'body-parser'
import axios from 'axios'
import { CronJob } from 'cron'
import md5 from 'md5'

// 設定Timezone
process.env.TZ = 'Asia/Taipei'

const port = 5454
const app = express()
app.use(bodyParser.json())

const configPath = 'config.json'
let config = []

function trigger () {
  const time = new Date().getMinutes() * 60 + new Date().getSeconds()

  // Freqs
  // 5s time % 5 === 0 (only in dev mode
  // 10s time % 10 === 0
  // 30s time % 30 === 0
  // 1m  time % 60 === 0
  // 5m  time % 300 === 0
  // 10m time % 600 === 0
  // 30m time % 1800 === 0
  // 1h  time % 3600 === 0

  if (time % 5 === 0) {
    findSite('5s')
  }
  if (time % 10 === 0) {
    findSite('10s')
  }
  if (time % 30 === 0) {
    findSite('30s')
  }
  if (time % 60 === 0) {
    findSite('1m')
  }
  if (time % 300 === 0) {
    findSite('5m')
  }
  if (time % 600 === 0) {
    findSite('10m')
  }
  if (time % 1800 === 0) {
    findSite('30m')
  }
  if (time % 3600 === 0) {
    findSite('1h')
  }
}

function findSite (freq) {
  config.sites
    .filter(item => item.freq === freq && item.status === 'on')
    .forEach(item => checkSite(item))
}

async function checkSite (site) {
  try {
    const res = await axios.get(
      site.url,
      {
        timeout: site.timeout || 5000,
      }
    )

    if (res.status === site.expectStatusCode) {
      site.errorTimes = 0
    } else {
      site.errorTimes++
    }

    if (site.errorTimes > 1) {
      const errorMsg = `非預期的status code，預期的是${site.expectStatusCode}，回應的是${res.status}`
      sendMessageToSlack(site, errorMsg)
    }
  } catch (err) {
    if (err.response && err.response.status === site.expectStatusCode) {
      site.errorTimes = 0
    } else {
      site.errorTimes++
    }

    if (site.errorTimes > 1) {
      if (err.response && err.response.status) {
        const errorMsg = `非預期的status code，預期的是${site.expectStatusCode}，回應的是${err.response.status}`
        sendMessageToSlack(site, errorMsg)
      } else {
        sendMessageToSlack(site, '網站沒有回應')
      }
    }
  }
}

async function sendMessageToSlack (site, msg) {
  try {
    const now = new Date()
    const url = 'https://slack.com/api/chat.postMessage'
    const res = await axios.post(url, {
      channel: '#' + (config.slackChannel || 'healthcheck'),
      // 如何搞一個漂亮的排版：
      // https://app.slack.com/block-kit-builder/
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `${site.name} 倒站囉！😱`
          }
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `🧭 網址：<${site.url}|${site.url}>    🕜 時間：${now.toLocaleDateString('zh-TW')} ${now.toLocaleTimeString('zh-TW')}
❕ 原因：${msg}`
            }
          ]
        },
        {
          type: 'divider'
        }
      ]
    }, { headers: { authorization: `Bearer ${config.slackToken}` } })
  } catch {}
}

function getConfig () {
  if (!fs.existsSync(configPath)) {
    console.log('[Error] No config.json found')
    return
  }

  const configStr = fs.readFileSync(configPath, 'utf-8')

  try {
    // update config
    config = JSON.parse(configStr)
    config.sites.forEach(site => site.errorTimes = 0)
  } catch {
    console.log('[Error] config.json broken')
    return
  }
}

function checkAuth (user, pwd) {
  const u = md5(user + pwd)

  for (let i = 0; i < config.users.length; i++) {
    const item = config.users[i]

    if (md5(item.user + item.pwd) === u) {
      return u
    }
  }

  return null
}

function checkToken (token) {
  for (let i = 0; i < config.users.length; i++) {
    const item = config.users[i]

    if (md5(item.user + item.pwd) === token) {
      return true
    }
  }

  return false
}

function initHealthCheckerCronJob () {
  getConfig()
  const job = new CronJob('*/5 * * * * *', trigger)
  job.start()
  console.log('[Success] CronJob started')
}

// init cron job
initHealthCheckerCronJob()

// Frontend console page
app.get('/', (req, res) => res.send(fs.readFileSync('./pages/admin.html', 'utf-8')))

// Frontend login
app.post('/auth', (req, res) => {
  if (req.body.user && req.body.pwd && config.users) {
    const token = checkAuth(req.body.user, req.body.pwd)

    if (token) {
      res.send(`{"token":"${token}"}`)
    } else {
      res.send('{"message":"invalid user"}', 401)
    }
  } else {
    res.send('{"message":"invalid user"}', 401)
  }
})

// Frontend get config
app.get('/config', (req, res) => {
  if (!req.headers.authorization || !checkToken(req.headers.authorization)) {
    res.send('{"message":"invalid user"}', 401)
    return
  }

  // 檢查有沒有config檔
  if (!fs.existsSync(configPath)) {
    res.send('{"users":[],slackToken":null,"slackChannel":"healthcheck","sites":[]}')
    return
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  // 移除config中的users
  delete config.users
  const configStr = JSON.stringify(config)
  res.send(configStr)
})

// Frontend update config
app.put('/config', (req, res) => {
  try {
    if (req.headers.authorization && checkToken(req.headers.authorization)) {
      const config = req.body

      // 檢查必要欄位
      if (!config.sites) {
        res.send('{"message":"no users data"}', 404)
        return
      } else if (!config.slackChannel || !config.slackToken) {
        res.send('{"message":"no slack data"}', 404)
        return
      }

      // 檢查有沒有config檔
      if (!fs.existsSync(configPath)) {
        res.send('{"users":[],slackToken":null,"slackChannel":"healthcheck","sites":[]}')
        return
      }

      const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      // 只更新需要更新的欄位
      savedConfig.sites = config.sites
      savedConfig.slackChannel = config.slackChannel
      savedConfig.slackToken = config.slackToken
      const configStr = JSON.stringify(savedConfig)

      fs.writeFileSync(configPath, configStr, 'utf-8')
      res.send(configStr)
      getConfig()
    } else {
      res.send('{"message":"invalid user"}', 401)
    }
  } catch {
    res.send('{"message":"An error occurred"}', 404)
  }
})

// create server
app.listen(port, () => {
  console.log(`HealthCheck API and FrontEnd listening on port ${port}`)
})
