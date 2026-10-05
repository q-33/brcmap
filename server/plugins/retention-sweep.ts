import { runRetentionSweep } from '../utils/retention'

// Hourly: apply server/utils/retention.ts. Modelled on broadcast-drip.ts —
// one instance runs this app, so a module flag is honest machinery; failures
// (database asleep, a table missing before its migration) are swallowed and
// retried next hour. The first pass runs a minute after boot so a long-idle
// deploy catches up without waiting an hour.
export default defineNitroPlugin(() => {
  let running = false
  const sweep = async () => {
    if (running)
      return
    running = true
    try {
      const { counts, errors } = await runRetentionSweep(useDb())
      const touched = Object.entries(counts).filter(([, n]) => n > 0).map(([k, n]) => `${k}=${n}`)
      if (touched.length)
        console.info(`[retention] ${touched.join(' ')}`)
      for (const e of errors)
        console.warn(`[retention] ${e}`)
    }
    catch {
      // nothing to do until next hour
    }
    finally {
      running = false
    }
  }
  setTimeout(sweep, 60_000)
  setInterval(sweep, 3_600_000)
})
