// =====================================================
//  ツール選択 - ツールバーのボタンを管理
// =====================================================

import { state } from './state.js';
import { $toolBar } from './dom.js';

// 全ボタンの active 表示を現在のツールに合わせる
function updateToolButtons() {
  $toolBar.querySelectorAll('.tool-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tool === state.selectedTool);
  });
}

// ツールバーのクリックを設定
export function setupTools() {
  $toolBar.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.selectedTool = btn.dataset.tool;
      updateToolButtons();
    });
  });
  updateToolButtons();
}
