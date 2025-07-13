import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableHead, TableRow, TableCell, TableHeader, TableBody } from "@/components/ui/table";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface FaxEntry {
  id: string;
  fax: string;
  office_name: string;
  email: string;
  service_kind: string;
}

export default function FaxPage() {
  const [entries, setEntries] = useState<FaxEntry[]>([]);
  const [editing, setEditing] = useState<FaxEntry | null>(null);
  const [formData, setFormData] = useState<Partial<FaxEntry>>({});

  useEffect(() => {
    fetchEntries();
  }, []);

  async function fetchEntries() {
    const { data, error } = await supabase.from("fax_directory").select();
    if (!error) setEntries(data as FaxEntry[]);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSave() {
    if (editing) {
      await supabase.from("fax_directory").update(formData).eq("id", editing.id);
    } else {
      await supabase.from("fax_directory").insert([formData]);
    }
    setFormData({});
    setEditing(null);
    fetchEntries();
  }

  async function handleDelete(id: string) {
    await supabase.from("fax_directory").delete().eq("id", id);
    fetchEntries();
  }

  return (
    <div className="flex">
      <aside className="w-64 h-screen bg-gray-100 p-4 border-r">
        <h2 className="text-lg font-semibold mb-4">メニュー</h2>
        <ul className="space-y-2">
          <li><a href="/portal" className="text-blue-600 hover:underline">ダッシュボード</a></li>
          <li><a href="/portal/fax" className="font-bold text-gray-900">FAX電話帳</a></li>
          <li><a href="/portal/kaipoke-info" className="text-blue-600 hover:underline">Kaipoke Info</a></li>
        </ul>
      </aside>
      <main className="flex-1 p-6">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-xl font-bold">FAX電話帳</h1>
          <Dialog>
            <DialogTrigger asChild>
              <Button onClick={() => { setEditing(null); setFormData({}) }}>新規追加</Button>
            </DialogTrigger>
            <DialogContent>
              <div className="space-y-2">
                <Input name="office_name" placeholder="事業所名" onChange={handleChange} value={formData.office_name || ""} />
                <Input name="fax" placeholder="FAX番号" onChange={handleChange} value={formData.fax || ""} />
                <Input name="email" placeholder="メールアドレス" onChange={handleChange} value={formData.email || ""} />
                <Input name="service_kind" placeholder="種別（例：医療機関）" onChange={handleChange} value={formData.service_kind || ""} />
                <Button onClick={handleSave}>保存</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Table className="w-full">
          <TableHeader>
            <TableRow>
              <TableHead>事業所名</TableHead>
              <TableHead>FAX番号</TableHead>
              <TableHead>メール</TableHead>
              <TableHead>種別</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell>{entry.office_name}</TableCell>
                <TableCell>{entry.fax}</TableCell>
                <TableCell>{entry.email}</TableCell>
                <TableCell>{entry.service_kind}</TableCell>
                <TableCell className="space-x-2">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        size="sm"
                        onClick={() => {
                          setEditing(entry);
                          setFormData(entry);
                        }}
                      >
                        編集
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <div className="space-y-2">
                        <Input name="office_name" placeholder="事業所名" onChange={handleChange} value={formData.office_name || ""} />
                        <Input name="fax" placeholder="FAX番号" onChange={handleChange} value={formData.fax || ""} />
                        <Input name="email" placeholder="メールアドレス" onChange={handleChange} value={formData.email || ""} />
                        <Input name="service_kind" placeholder="種別（例：医療機関）" onChange={handleChange} value={formData.service_kind || ""} />
                        <Button onClick={handleSave}>保存</Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                  <Button variant="destructive" size="sm" onClick={() => handleDelete(entry.id)}>
                    削除
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </main>
    </div>
  );
}
