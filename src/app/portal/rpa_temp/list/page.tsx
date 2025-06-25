'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTrigger, DialogTitle } from '@/components/ui/dialog';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Checkbox } from '@/components/ui/checkbox';

type Template = {
  id: string;
  name: string;
  description: string;
  kind_name: string;
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

type CommandType = {
  name: string;
};

type TemplateWithKind = {
  id: string;
  name: string;
  description: string;
  rpa_command_kind: {
    name: string | null;
  } | null;
};

export default function RpaCommandTemplateListPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [args, setArgs] = useState<Arg[]>([]);
  const [types, setTypes] = useState<CommandType[]>([]);
  const [newTemplate, setNewTemplate] = useState({ name: '', description: '' });
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const [newArg, setNewArg] = useState({
    key: '',
    label: '',
    required: false,
    type: 'text',
    sort_order: 0
  });

  useEffect(() => {
    fetchTemplates();
    fetchArgs();
    fetchTypes();
  }, []);

  const fetchTemplates = async () => {
    const { data, error } = await supabase
      .from('rpa_command_templates')
      .select('id, name, description, rpa_command_kind(name)')
      .order('created_at');

    if (error) {
      console.error('Fetch templates error:', error);
    } else if (data) {
      const formatted = (data as unknown as TemplateWithKind[]).map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        kind_name: t.rpa_command_kind?.name ?? ''
      }));
      setTemplates(formatted);
    }
  };

  const fetchArgs = async () => {
    const { data, error } = await supabase
      .from('rpa_command_args')
      .select('*')
      .order('sort_order');

    if (!error && data) setArgs(data);
  };

  const fetchTypes = async () => {
    const { data, error } = await supabase
      .from('rpa_command_type')
      .select('name')
      .order('sort_order');

    if (!error && data) setTypes(data);
  };

  const handleAddTemplate = async () => {
    if (!newTemplate.name) return;

    const { data, error } = await supabase
      .from('rpa_command_templates')
      .insert([newTemplate])
      .select();

    if (!error && data) {
      const added = (data as {
        id: string;
        name: string;
        description: string;
      }[]).map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        kind_name: ''  // kind は insert時は空
      }));

      setTemplates([...templates, ...added]);
      setNewTemplate({ name: '', description: '' });
      setAddDialogOpen(false);
    }
  };

  const handleAddArg = async (templateId: string) => {
    if (!newArg.key) return;
    const payload = { ...newArg, template_id: templateId };

    const { data, error } = await supabase.from('rpa_command_args').insert([payload]).select();
    if (!error && data) {
      setArgs([...args, ...data]);
      setNewArg({ key: '', label: '', required: false, type: 'text', sort_order: 0 });
    }
  };

  const handleArgChange = (id: string, field: keyof Arg, value: string | number | boolean) => {
    setArgs(prev => prev.map(arg => arg.id === id ? { ...arg, [field]: value } : arg));
  };

  const handleSaveArg = async (id: string) => {
    const arg = args.find(a => a.id === id);
    if (arg) {
      const { error } = await supabase
        .from('rpa_command_args')
        .update({
          key: arg.key,
          label: arg.label,
          type: arg.type,
          required: arg.required,
          sort_order: arg.sort_order
        })
        .eq('id', id);

      if (error) console.error('Update arg error:', error);
    }
  };

  const handleDeleteArg = async (id: string) => {
    const { error } = await supabase.from('rpa_command_args').delete().eq('id', id);
    if (!error) setArgs(prev => prev.filter(a => a.id !== id));
  };

  const handleDeleteTemplate = async (id: string) => {
    const { error } = await supabase.from('rpa_command_templates').delete().eq('id', id);
    if (!error) {
      setTemplates(prev => prev.filter(t => t.id !== id));
      setArgs(prev => prev.filter(a => a.template_id !== id));
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">RPA コマンドテンプレート管理</h1>

      <Accordion type="multiple">
        {templates.map(template => (
          <AccordionItem key={template.id} value={template.id}>
            <AccordionTrigger className="flex justify-between items-center bg-gray-100 p-3 rounded-md mb-2">
              <div>
                <div className="text-lg font-semibold">{template.name}</div>
                <div className="text-sm text-gray-600">{template.description}（{template.kind_name}）</div>
              </div>
              <div className="flex gap-2">
                <Button size="sm">編集</Button>
                <Button size="sm" variant="destructive" onClick={() => handleDeleteTemplate(template.id)}>削除</Button>
              </div>
            </AccordionTrigger>
            <AccordionContent className="bg-white border p-4">
              <div className="grid grid-cols-6 font-bold border-b pb-2 mb-2">
                <div>key</div><div>label</div><div>type</div><div>必須</div><div>順序</div><div>操作</div>
              </div>
              {args.filter(arg => arg.template_id === template.id).map(arg => (
                <div key={arg.id} className="grid grid-cols-6 gap-2 mb-1 items-center">
                  <Input value={arg.key} onChange={e => handleArgChange(arg.id, 'key', e.target.value)} />
                  <Input value={arg.label} onChange={e => handleArgChange(arg.id, 'label', e.target.value)} />
                  <select
                    value={arg.type}
                    onChange={e => handleArgChange(arg.id, 'type', e.target.value)}
                    className="border rounded px-2 py-1"
                  >
                    {types.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
                  </select>
                  <Checkbox checked={arg.required} onCheckedChange={val => handleArgChange(arg.id, 'required', !!val)} />
                  <Input type="number" value={arg.sort_order} onChange={e => handleArgChange(arg.id, 'sort_order', +e.target.value)} />
                  <div className="flex gap-1">
                    <Button size="sm" onClick={() => handleSaveArg(arg.id)}>保存</Button>
                    <Button size="sm" variant="destructive" onClick={() => handleDeleteArg(arg.id)}>削除</Button>
                  </div>
                </div>
              ))}
              {/* 追加行 */}
              <div className="grid grid-cols-6 gap-2 mt-3">
                <Input placeholder="key" value={newArg.key} onChange={e => setNewArg(prev => ({ ...prev, key: e.target.value }))} />
                <Input placeholder="label" value={newArg.label} onChange={e => setNewArg(prev => ({ ...prev, label: e.target.value }))} />
                <select value={newArg.type} onChange={e => setNewArg(prev => ({ ...prev, type: e.target.value }))} className="border rounded px-2 py-1">
                  {types.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
                </select>
                <Checkbox checked={newArg.required} onCheckedChange={val => setNewArg(prev => ({ ...prev, required: !!val }))} />
                <Input type="number" value={newArg.sort_order} onChange={e => setNewArg(prev => ({ ...prev, sort_order: +e.target.value }))} />
                <Button onClick={() => handleAddArg(template.id)}>追加</Button>
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogTrigger asChild>
          <Button className="mt-4">テンプレートを追加</Button>
        </DialogTrigger>
        <DialogContent className="p-4">
          <DialogTitle>新規テンプレート</DialogTitle>
          <Input placeholder="名前" value={newTemplate.name} onChange={e => setNewTemplate({ ...newTemplate, name: e.target.value })} />
          <Input placeholder="説明" value={newTemplate.description} onChange={e => setNewTemplate({ ...newTemplate, description: e.target.value })} />
          <Button className="mt-2" onClick={handleAddTemplate}>追加</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

