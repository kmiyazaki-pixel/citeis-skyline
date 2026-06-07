// =====================================================
//  UI - ステータスバーの更新
// =====================================================

import { state } from './state.js';
import { $cashDisplay, $popDisplay } from './dom.js';
import { formatCash, formatPop } from './utils.js';

export function updateStatusBar() {
  $cashDisplay.textContent = formatCash(state.cash);
  $popDisplay.textContent  = '👥 ' + formatPop(state.population);
}
