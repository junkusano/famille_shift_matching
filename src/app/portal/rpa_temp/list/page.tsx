'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
//import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTrigger, DialogTitle } from '@/components/ui/dialog';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Checkbox } from '@/components/ui/checkbox';

type Template = {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
};

type Arg = {
  id: string;
  template_id: string;
  key: string;
  label: string;
  required: boolean;
  type: string;
  sort_order: number;
};

export default function RpaCommandTemplateListPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [args, setArgs] = useState<Arg[]>([]);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [adding, setAdding] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  // 新規 arg 入力
  const [newKey, setNewKey] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState('text');
  const [newRequired, setNewRequired] = useState(false);

  useEffect(() => {
    fetchTemplates();
    fetchArgs();
  }, []);

  const fetchTemplates = async () => {
    const { data, error } = await supabase
      .from('rpa_command_templates')
      .select('*')
      .order('created_at');

    if (error) {
      console.error('Fetch templates error:', JSON.stringify(error, null, 2));
    } else {
      setTemplates(data as Template[]);
    }
  };

  const fetchArgs = async () => {
    const { data, error } = await supabase
      .from('rpa_command_args')
      .select('*')
      .order('sort_order');

    if (error) {
      console.error('Fetch args error:', JSON.stringify(error, null, 2));
    } else {
      setArgs(data as Arg[]);
    }
  };

  const handleAddTemplate = async () => {
    if (!newName) return;
    setAdding(true);
    const { data, error } = await supabase.from('rpa_command_templates').insert([
      {
        name: newName,
        description: newDescription,
        arg_labels: {},
        result_labels: {}
      }
    ]).select();

    setAdding(false);

    if (error) {
      console.error('Insert template error:', JSON.stringify(error, null, 2));
    } else {
      setTemplates([...templates, ...(data as Template[])]);
      setNewName('');
      setNewDescription('');
      setAddDialogOpen(false);
    }
  };

  const handleAddArg = async (templateId: string) => {
    if (!newKey) return;
    const { data, error } = await supabase.from('rpa_command_args').insert([
      {
        template_id: templateId,
        key: newKey,
        label: newLabel,
        required: newRequired,
        type: newType,
        sort_order: 0
      }
    ]).select();

    if (error) {
      console.error('Insert arg error:', JSON.stringify(error, null, 2));
    } else {
      setArgs([...args, ...(data as Arg[])]);
      setNewKey('');
      setNewLabel('');
      setNewType('text');
      setNewRequired(false);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    const { error } = await supabase.from('rpa_command_templates').delete().eq('id', id);
    if (error) {
      console.error('Delete template error:', JSON.stringify(error, null, 2));
    } else {
      setTemplates(templates.filter(t => t.id !== id));
      setArgs(args.filter(a => a.template_id !== id)); // 表示上も削除
    }
  };

  return (
    <div className="content">
      <h1 className="text-2xl font-bold mb-4">RPA コマンドテンプレート管理</h1>

      <Accordion type="multiple">
        {templates.map((template) => (
          <AccordionItem key={template.id} value={template.id}>
            <AccordionTrigger>
              {template.name}
            </AccordionTrigger>
            <AccordionContent>
              {args.filter(a => a.template_id === template.id).map(arg => (
                <div key={arg.id} className="flex gap-2 items-center border-b py-1">
                  <div className="w-1/4">{arg.key}</div>
                  <div className="w-1/4">{arg.label}</div>
                  <div className="w-1/6">{arg.type}</div>
                  <div className="w-1/6">{arg.required ? '必須' : '任意'}</div>
                  <div className="w-1/6">並び順: {arg.sort_order}</div>
                </div>
              ))}

              <div className="grid gap-2 mt-2">
                <Input placeholder="key" value={newKey} onChange={(e) => setNewKey(e.target.value)} />
                <Input placeholder="label" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
                <Input placeholder="type" value={newType} onChange={(e) => setNewType(e.target.value)} />
                <Checkbox checked={newRequired} onCheckedChange={(val) => setNewRequired(!!val)}>
                  必須
                </Checkbox>
                <Button onClick={() => handleAddArg(template.id)}>パラメータ追加</Button>
              </div>

              <Button variant="destructive" className="mt-2" onClick={() => handleDeleteTemplate(template.id)}>
                テンプレート削除
              </Button>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
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
            <Button onClick={handleAddTemplate} disabled={adding}>
              {adding ? '送信中...' : '追加'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
