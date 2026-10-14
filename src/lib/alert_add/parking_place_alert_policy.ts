export function shouldKeepParkingPlaceAlert(args: {
  hasActiveParkingPlace: boolean;
  permitRequired?: boolean | null;
}) {
  // 駐車場が登録済みなら、許可証の要否にかかわらず「場所未入力」ではない。
  return !args.hasActiveParkingPlace;
}
