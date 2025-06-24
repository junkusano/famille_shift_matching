'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTrigger, DialogTitle } from '@/components/ui/dialog';

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
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    const { data, error } = await supabase.from('rpa_templates').select('*').order('created_at');
    if (error) {
      console.error('Fetch error:', JSON.stringify(error, null, 2));
    } else {
      setTemplates(data as Template[]);
    }
  };

  const handleAddTemplate = async () => {
    if (!newName) return;
    const { data, error } = await supabase.from('rpa_templates').insert([
      {
        name: newName,
        description: newDescription,
        arg_labels: {},
        result_labels: {}
      }
    ]).select();

    if (error) {
      console.error('Insert error:', JSON.stringify(error, null, 2));
    } else {
      setTemplates([...templates, ...(data as Template[])]);
      setNewName('');
      setNewDescription('');
    }
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
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog>
        <DialogTrigger asChild>
          <Button className="mt-4">新規テンプレート追加</Button>
        </DialogTrigger>
        <DialogContent className="p-4">
          <DialogTitle>新規テンプレート追加</DialogTitle>
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
