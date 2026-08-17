export type TaimeeApplicantIdentity = { fullName?: string | null; phone?: string | null }
export type EntryCandidate = { id: string; fullName: string; phone: string | null }
export function normalizeTaimeePhone(value: unknown): string {
  if (typeof value !== 'string') return ''
  const normalized = value.replace(/[\s()-]/g, '').replace(/^\+81/, '0')
  return /^0\d{9,10}$/.test(normalized) ? normalized : ''
}
export function chooseUniqueEntry(applicant: TaimeeApplicantIdentity, candidates: EntryCandidate[]): EntryCandidate | null {
  const phone = normalizeTaimeePhone(applicant.phone)
  if (phone) {
    const matches = candidates.filter((candidate) => normalizeTaimeePhone(candidate.phone) === phone)
    if (matches.length === 1) return matches[0]
    if (matches.length > 1) return null
  }
  const fullName = applicant.fullName?.trim()
  if (!fullName) return null
  const matches = candidates.filter((candidate) => candidate.fullName.trim() === fullName)
  return matches.length === 1 ? matches[0] : null
}
