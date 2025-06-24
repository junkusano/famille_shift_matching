'use client';

'use client';

import React from 'react'; // ←これを追加
import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';


type Template = {
  id: string;
  name: string;
  description: string;
};

export default function RpaTemplateListPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');

  useEffect(() => {
    // データ取得 (仮データ)
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    // TODO: Supabase APIでテンプレ一覧を取得
    setTemplates([
      { id: '1', name: 'カイポケアカウント追加', description: 'カイポケ用のアカウント生成テンプレ' },
      { id: '2', name: 'FAX送信', description: 'FAX送信用テンプレ' }
    ]);
  };

  const handleAddTemplate = async () => {
    if (!newName) return;
    // TODO: Supabase insert 処理
    const newTemplate: Template = {
      id: Math.random().toString(), // 仮ID
      name: newName,
      description: newDescription
    };
    setTemplates([...templates, newTemplate]);
    setNewName('');
    setNewDescription('');
  };

  const handleDelete = (id: string) => {
    // TODO: Supabase delete 処理
    setTemplates(templates.filter((t) => t.id !== id));
  };

  return (
    <div className="content">

      <h1 className="text-2xl font-bold mb-4">RPA テンプレート管理</h1>

      <div className="grid gap-4">
        {templates.map((template) => (
          <Card key={template.id}>
            <CardContent className="p-4 flex justify-between items-center">
              <div>
                <div className="font-semibold">{template.name}</div>
                <div className="text-sm text-gray-500">{template.description}</div>
              </div>
              <Button variant="destructive" onClick={() => handleDelete(template.id)}>
                削除
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog>
        <DialogTrigger asChild>
          <Button className="mt-4">新規テンプレート追加</Button>
        </DialogTrigger>
        <DialogContent className="p-4">
          <div className="grid gap-2">
            <Input
              placeholder="テンプレート名"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <Input
              placeholder="説明"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
            />
            <Button onClick={handleAddTemplate}>追加</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
