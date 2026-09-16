// lib/format.ts
import type { DrawdownType } from './firms/types'

// Was duplicated as a two-way ternary (trailing_eod ? 'EOD' : 'Intraday') in
// 5 places across the app and admin dashboard — every one of them silently
// mislabeled a 'static' account (e.g. Apex's $100K Static) as "Intraday".
export function formatDrawdownType(type: DrawdownType): string {
  switch (type) {
    case 'trailing_eod':      return 'EOD'
    case 'trailing_intraday': return 'Intraday'
    case 'static':            return 'Static'
  }
}
