import fs from 'fs'
import axios from 'axios'
import { CronJob } from 'cron'

const configPath = 'config.json'
let slackToken = null
let config = []

function trigger () {
  const time = new Date().getMinutes() * 60 + new Date().getSeconds()

  // 5s time % 60 === 5 (only in dev mode
  // 30s time % 60 === 30
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

  // console.log('time change', time)
}

function findSite (freq) {
  config.sites.filter(item => item.freq === freq).forEach(item => checkSite(item))
}

async function checkSite (site) {
  try {
    const res = await axios.get(site.url)

    // if (res.status !== 200) {
    //   throw new Error('非200')
    // }
    // console.log('恭喜，' + site.name + '還活著')
  } catch (err) {

    // if (err.response && err.response.status === 401) {
    if (err.response) {
      // console.log('恭喜，' + site.name + '還活著')
      return
    }
    // 這邊要透過slack回報
    sendMessageToSlack(site)
    // console.log(site.name + '倒站囉！！！')
  }
}

// npm start時啟動一次
// 隨著前台透過api更新資料後，再重啟一次
function initHealthCheckerCronJob () {
  if (!fs.existsSync(configPath)) {
    console.log('[Error] No config.json found')
    return
  }

  const configStr = fs.readFileSync(configPath, 'utf-8')

  try {
    config = JSON.parse(configStr)
    slackToken = config.slackToken
  } catch {
    console.log('[Error] config.json broken')
    return
  }

  // console.log(config)

  // 因為可以設定 30秒,1分鐘,5分鐘,10分鐘,30分鐘,1小時 打一次
  // 因此最少每30秒要跑一次
  const job = new CronJob('0,5,10,15,20,25,30,35,40,45,50,55 * * * * *', trigger)
  job.start()
  console.log('[Success] CronJob started')
}

// config設定內容
// 網站名稱
// 網址
// 檢查頻率
// 檢查項目
// 逾時時間

initHealthCheckerCronJob()

async function sendMessageToSlack (site) {
  try {
    const url = 'https://slack.com/api/chat.postMessage'
    const res = await axios.post(url, {
      channel: '#healthcheck',
      // https://app.slack.com/block-kit-builder/
      blocks: [
        {
          type: 'context',
          elements: [
            {
              type: 'plain_text',
              text: `😱 告訴你一個壞消息 ${site.name} 倒站囉！！！`
              // emoji: true
            }
          ]
        },
        {
          type: 'divider'
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `🧭 網址：<${site.url}|${site.name}>  🕜 時間：${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`
              // emoji: true
            }
          ]
        },
        {
          type: 'divider'
        }
      ]
    }, { headers: { authorization: `Bearer ${slackToken}` } })
    // console.log(res)
  } catch (err) {
    // console.log(err)
  }
}
