import { generateRegularEntryHtml } from "./regularEntry";
import { generateContractEntryHtml } from "./contractEntry";

export function generateApplicantHtml(body: any): string {
  const work_styles = body.work_styles || [];
  const commutes = body.commute_options || [];
  const noCert = body.noCertifications === "on";

  if (
    work_styles.includes("正社員を希望している（エントリー後採用面接に進みます）　") ||
    commutes.includes("社有車希望（週30時間以上勤務＋自宅近隣駐車場用意が条件　エントリー後詳細確認します）　") ||
    noCert
  ) {
    return generateRegularEntryHtml(body);
  }

  return generateContractEntryHtml(body);
}
