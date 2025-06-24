'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTrigger, DialogTitle } from '@/components/ui/dialog';

const supabaseUrl = 'https://your-project.supabase.co';
const supabaseAnonKey = 'your-anon-key';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

type Template = {
  id: string;
  name: string;
  description: string;
  arg_labels: object;
  result_labels: object;
};

export default function RpaTemplateListPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    const { data, error } = await supabase.from('rpa_templates').select('*').order('created_at');
    if (error) {
      console.error('Fetch error:', error);
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
      console.error('Insert error:', error);
    } else {
      setTemplates([...templates, ...(data as Template[])]);
      setNewName('');
      setNewDescription('');
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('rpa_templates').delete().eq('id', id);
    if (error) {
      console.error('Delete error:', error);
    } else {
      setTemplates(templates.filter((t) => t.id !== id));
    }
  };

  const startEdit = (template: Template) => {
    setEditId(template.id);
    setEditName(template.name);
    setEditDescription(template.description);
  };

  console.log("Insert payload", {
    name: newName,
    description: newDescription,
    arg_labels: {},
    result_labels: {}
  });

  const handleUpdate = async () => {
    if (!editId) return;
    const { data, error } = await supabase.from('rpa_templates')
      .update({
        name: editName,
        description: editDescription
      })
      .eq('id', editId)
      .select();
    if (error) {
      console.error('Update error:', error);
    } else {
      setTemplates(templates.map((t) => t.id === editId ? (data![0] as Template) : t));
      setEditId(null);
      setEditName('');
      setEditDescription('');
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
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => startEdit(template)}>
                  編集
                </Button>
                <Button variant="destructive" onClick={() => handleDelete(template.id)}>
                  削除
                </Button>
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

      {editId && (
        <Dialog open onOpenChange={(open) => { if (!open) setEditId(null); }}>
          <DialogContent className="p-4">
            <DialogTitle>テンプレート編集</DialogTitle>
            <div className="grid gap-2">
              <Input
                placeholder="テンプレート名"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
              <Input
                placeholder="説明"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
              />
              <Button onClick={handleUpdate}>更新</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
