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

type TemplateWithKind = {
  id: string;
  name: string;
  description: string;
  rpa_command_kind: {
    name: string;
  }[];
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

export default function RpaCommandTemplateListPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [args, setArgs] = useState<Arg[]>([]);
  const [types, setTypes] = useState<CommandType[]>([]);

  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const [newArgs, setNewArgs] = useState<Record<string, Partial<Arg>>>({});

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

    console.log("fetchTemplates result", { data, error });
    if (error) {
      console.error('Fetch templates error:', error);

      return;
    }

    const formatted = (data as TemplateWithKind[]).map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      kind_name: t.rpa_command_kind[0]?.name || '',
    }));


    setTemplates(formatted);
  };

  const fetchArgs = async () => {
    const { data, error } = await supabase
      .from('rpa_command_args')
      .select('*')
      .order('sort_order');

    if (error) {
      console.error('Fetch args error:', error);
    } else {
      setArgs(data as Arg[]);
    }
  };

  const fetchTypes = async () => {
    const { data, error } = await supabase.from('rpa_command_type').select('name').order('sort_order');
    if (error) {
      console.error('Fetch types error:', error);
    } else {
      setTypes(data as CommandType[]);
    }
  };

  const handleArgChange = (id: string, field: keyof Arg, value: string | number | boolean) => {
    setArgs(args.map(arg => arg.id === id ? { ...arg, [field]: value } : arg));
  };

  const handleSaveArg = async (id: string) => {
    const arg = args.find(a => a.id === id);
    if (!arg) return;
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
  };

  const handleDeleteArg = async (id: string) => {
    const { error } = await supabase.from('rpa_command_args').delete().eq('id', id);
    if (!error) setArgs(args.filter(a => a.id !== id));
  };

  const handleDeleteTemplate = async (id: string) => {
    const { error } = await supabase.from('rpa_command_templates').delete().eq('id', id);
    if (!error) {
      setTemplates(templates.filter(t => t.id !== id));
      setArgs(args.filter(a => a.template_id !== id));
    }
  };

  const handleAddArg = async (templateId: string) => {
    const newArg = newArgs[templateId];
    if (!newArg?.key) return;

    const { data, error } = await supabase.from('rpa_command_args').insert([
      {
        template_id: templateId,
        key: newArg.key,
        label: newArg.label || '',
        type: newArg.type || 'text',
        required: newArg.required || false,
        sort_order: newArg.sort_order || 0
      }
    ]).select();

    if (!error && data) {
      setArgs([...args, ...(data as Arg[])]);
      setNewArgs(prev => ({ ...prev, [templateId]: {} }));
    }
  };

  const handleAddTemplate = async () => {
    console.log("handleAddTemplate called");
    if (!newName) {
      console.log("テンプレート名が空です");
      return;
    }
    const { data, error } = await supabase.from('rpa_command_templates').insert([
      { name: newName, description: newDescription }
    ]).select();
    console.log("insert result", { data, error });
    if (!error) {
      setNewName('');
      setNewDescription('');
      setAddDialogOpen(false);
      fetchTemplates();
    } else {
      alert("追加に失敗しました: " + error.message);
    }
  };


  return (
    <div className="content">
      <h1 className="text-2xl font-bold mb-4">RPA コマンドテンプレート管理</h1>

      <Accordion type="multiple">
        {templates.map(template => (
          <AccordionItem key={template.id} value={template.id}>
            <AccordionTrigger className="flex justify-between items-center p-2 border rounded bg-gray-50">
              <div>
                <div className="text-xl font-bold">{template.name}</div>
                <div className="text-sm text-gray-500">{template.description}（種別: {template.kind_name}）</div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => alert('テンプレート編集仮')}>編集</Button>
                <Button size="sm" variant="destructive" onClick={() => handleDeleteTemplate(template.id)}>削除</Button>
              </div>
            </AccordionTrigger>
            <AccordionContent className="border p-2 bg-white">
              <div className="grid grid-cols-6 gap-2 font-bold border-b py-1 bg-gray-100">
                <div>key</div>
                <div>label</div>
                <div>type</div>
                <div>必須</div>
                <div>並び順</div>
                <div>操作</div>
              </div>
              {args.filter(arg => arg.template_id === template.id).map(arg => (
                <div key={arg.id} className="grid grid-cols-6 gap-2 items-center border-b py-1">
                  <Input value={arg.key} onChange={e => handleArgChange(arg.id, 'key', e.target.value)} />
                  <Input value={arg.label} onChange={e => handleArgChange(arg.id, 'label', e.target.value)} />
                  <select
                    value={arg.type}
                    onChange={e => handleArgChange(arg.id, 'type', e.target.value)}
                    className="border rounded p-1"
                  >
                    {types.map(t => (
                      <option key={t.name} value={t.name}>{t.name}</option>
                    ))}
                  </select>
                  <Checkbox
                    checked={arg.required}
                    onCheckedChange={val => handleArgChange(arg.id, 'required', !!val)}
                  />
                  <Input type="number" value={arg.sort_order} onChange={e => handleArgChange(arg.id, 'sort_order', parseInt(e.target.value))} />
                  <div className="flex gap-1">
                    <Button size="sm" onClick={() => handleSaveArg(arg.id)}>保存</Button>
                    <Button size="sm" variant="destructive" onClick={() => handleDeleteArg(arg.id)}>削除</Button>
                  </div>
                </div>
              ))}
              <div className="grid grid-cols-6 gap-2 items-center mt-2">
                <Input
                  placeholder="key"
                  value={newArgs[template.id]?.key || ''}
                  onChange={e => setNewArgs(prev => ({ ...prev, [template.id]: { ...prev[template.id], key: e.target.value } }))}
                />
                <Input
                  placeholder="label"
                  value={newArgs[template.id]?.label || ''}
                  onChange={e => setNewArgs(prev => ({ ...prev, [template.id]: { ...prev[template.id], label: e.target.value } }))}
                />
                <select
                  value={newArgs[template.id]?.type || 'text'}
                  onChange={e => setNewArgs(prev => ({ ...prev, [template.id]: { ...prev[template.id], type: e.target.value } }))}
                  className="border rounded p-1"
                >
                  {types.map(t => (
                    <option key={t.name} value={t.name}>{t.name}</option>
                  ))}
                </select>
                <Checkbox
                  checked={!!newArgs[template.id]?.required}
                  onCheckedChange={val => setNewArgs(prev => ({ ...prev, [template.id]: { ...prev[template.id], required: !!val } }))}
                />
                <Input
                  type="number"
                  value={newArgs[template.id]?.sort_order || 0}
                  onChange={e => setNewArgs(prev => ({ ...prev, [template.id]: { ...prev[template.id], sort_order: parseInt(e.target.value) } }))}
                />
                <Button onClick={() => handleAddArg(template.id)}>追加</Button>
              </div>
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
            <Input placeholder="テンプレート名" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <Input placeholder="説明" value={newDescription} onChange={(e) => setNewDescription(e.target.value)} />
            <Button onClick={handleAddTemplate}>追加</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
