// src/utils/kanaPrefix.ts

export function hiraToKata(str: string): string {
  return str.replace(/[\u3041-\u3096]/g, (m) =>
    String.fromCharCode(m.charCodeAt(0) + 0x60)
  );
}

export function addAreaPrefixToKana(areaName: string, kana: string): string {
  let prefix = '';
  if (areaName.includes('高蔵寺')) {
    prefix = 'ハ２　';
  } else if (areaName.includes('尾張西')) {
    prefix = 'ヒ２　';
  } else if (areaName.includes('名北')) {
    prefix = 'メ２　';
  }
  return prefix + hiraToKata(kana || '');
}
