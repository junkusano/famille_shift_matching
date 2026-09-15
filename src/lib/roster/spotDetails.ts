type Contact = { last_name: string | null; first_name: string | null; phone: string | null };

export function confirmedPhone(name: string | null, people: Contact[]): string | null {
    const normalize = (value: string) => value.normalize('NFKC').replace(/[\s　]/g, '');
    if (!name || !normalize(name)) return null;
    const matches = people.filter(person => normalize((person.last_name ?? '') + (person.first_name ?? '')) === normalize(name));
    return matches.length === 1 ? matches[0].phone : null;
}

export function taimeeJobUrl(jobId: string | number | null | undefined): string | null {
    if (jobId == null || !/^\d+$/.test(String(jobId))) return null;
    // 既存のタイミー求人リンクで使用しているファミーユの事業所。
    return 'https://app-new.taimee.co.jp/clients/263546/offerings/' + jobId;
}
