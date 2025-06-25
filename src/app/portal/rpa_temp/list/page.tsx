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
  kind_id: string;
  kind_name: string;
};

type RawTemplateRow = {
  id: string;
  name: string;
  description: string;
  kind_id: string;
  rpa_command_kind?: { name: string }[] | null;
};

type Kind = {
  id: string;
  name: string;
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
  const [kinds, setKinds] = useState<Kind[]>([]);
  const [newKindId, setNewKindId] = useState('');
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newArgs, setNewArgs] = useState<Record<string, Partial<Arg>>>({});
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editTemplateId, setEditTemplateId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editKindId, setEditKindId] = useState('');

  useEffect(() => {
    fetchTemplates();
    fetchArgs();
    fetchTypes();
    fetchKinds();
  }, []);

  const fetchKinds = async () => {
    const { data, error } = await supabase.from('rpa_command_kind').select('id, name').order('sort_order');
    if (!error && data) setKinds(data as Kind[]);
  };

  const fetchTemplates = async () => {
    const { data, error } = await supabase
      .from('rpa_command_templates')
      .select('id, name, description, kind_id, rpa_command_kind(name)')
      .order('created_at');
    if (error) {
      console.error('Fetch templates error:', error);
      return;
    }
    const formatted = (data as RawTemplateRow[]).map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      kind_id: t.kind_id,
      kind_name: Array.isArray(t.rpa_command_kind)
        ? t.rpa_command_kind[0]?.name || ''
        : '',
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

  // Arg行の変更
  const handleArgChange = (id: string, field: keyof Arg, value: string | number | boolean) => {
    setArgs(args.map(arg => arg.id === id ? { ...arg, [field]: value } : arg));
  };

  // Argの保存（requiredも含め反映）
  const handleSaveArg = async (id: string) => {
    console.log('handleSaveArg called', id);
    const arg = args.find(a => a.id === id);
    if (!arg) return;
    console.log('updating arg', arg);
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
    if (!error) {
      fetchArgs();
      console.log('update ok');
    }
    if (error) {
      alert('保存に失敗しました: ' + error.message);
      console.error(error);
    }
  };

  // Argの削除（確認あり）
  const handleDeleteArg = async (id: string) => {
    if (!window.confirm('本当にこのArgを削除しますか？')) return;
    const { error } = await supabase.from('rpa_command_args').delete().eq('id', id);
    if (!error) setArgs(args.filter(a => a.id !== id));
  };

  // テンプレートの削除（確認あり）
  const handleDeleteTemplate = async (id: string) => {
    if (!window.confirm('本当にこのテンプレートを削除しますか？')) return;
    const { error } = await supabase.from('rpa_command_templates').delete().eq('id', id);
    if (!error) {
      setTemplates(templates.filter(t => t.id !== id));
      setArgs(args.filter(a => a.template_id !== id));
    }
  };

  // Arg追加
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

  // テンプレート追加
  const handleAddTemplate = async () => {
    if (!newName || !newKindId) {
      alert('テンプレート名と種別を入力してください');
      return;
    }
    const { error } = await supabase.from('rpa_command_templates').insert([
      { name: newName, description: newDescription, kind_id: newKindId }
    ]);
    if (!error) {
      setNewName('');
      setNewDescription('');
      setNewKindId('');
      setAddDialogOpen(false);
      fetchTemplates();
    } else {
      alert("追加に失敗しました: " + error.message);
    }
  };

  // テンプレート編集（編集ダイアログを開く）
  const handleOpenEdit = (template: Template) => {
    setEditTemplateId(template.id);
    setEditName(template.name);
    setEditDescription(template.description);
    setEditKindId(template.kind_id);
    setEditDialogOpen(true);
  };

  // テンプレート編集・保存
  const handleEditTemplate = async () => {
    if (!editTemplateId || !editName || !editKindId) {
      alert('テンプレート名・種別は必須です');
      return;
    }
    const { error } = await supabase.from('rpa_command_templates').update({
      name: editName,
      description: editDescription,
      kind_id: editKindId,
    }).eq('id', editTemplateId);
    if (!error) {
      setEditDialogOpen(false);
      setEditTemplateId(null);
      fetchTemplates();
    } else {
      alert("更新に失敗しました: " + error.message);
    }
  };

  return (
    <div className="content">
      <h1 className="text-2xl font-bold mb-4">RPA コマンドテンプレート管理</h1>
      <Accordion type="multiple">
        {templates.map(template => (
          <AccordionItem key={template.id} value={template.id}>
            <div className="border rounded shadow p-4 mb-4 bg-white">
              <div className="flex justify-between items-center mb-2">
                <div>
                  <div className="text-xl font-bold">{template.name}</div>
                  <div className="text-sm text-gray-500">{template.description}（種別: {template.kind_name}）</div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => handleOpenEdit(template)}>編集</Button>
                  <Button size="sm" variant="destructive" onClick={() => handleDeleteTemplate(template.id)}>削除</Button>
                </div>
              </div>
              <AccordionTrigger className="w-full flex justify-between items-center p-2 border rounded bg-gray-50 cursor-pointer">
                <span>詳細▼</span>
              </AccordionTrigger>
              <AccordionContent className="border-t p-2 bg-white">
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
            </div>
          </AccordionItem>
        ))}
      </Accordion>

      {/* 新規テンプレート追加ダイアログ */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogTrigger asChild>
          <Button className="mt-4">新規テンプレート追加</Button>
        </DialogTrigger>
        <DialogContent className="p-4">
          <DialogTitle>新規テンプレート追加</DialogTitle>
          <div className="grid gap-2">
            <Input placeholder="テンプレート名" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <Input placeholder="説明" value={newDescription} onChange={(e) => setNewDescription(e.target.value)} />
            <select value={newKindId} onChange={e => setNewKindId(e.target.value)} className="border rounded p-1">
              <option value="">-- 種別を選択 --</option>
              {kinds.map(k => (
                <option key={k.id} value={k.id}>{k.name}</option>
              ))}
            </select>
            <Button onClick={handleAddTemplate}>追加</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* テンプレート編集ダイアログ */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="p-4">
          <DialogTitle>テンプレート編集</DialogTitle>
          <div className="grid gap-2">
            <Input placeholder="テンプレート名" value={editName} onChange={(e) => setEditName(e.target.value)} />
            <Input placeholder="説明" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
            <select value={editKindId} onChange={e => setEditKindId(e.target.value)} className="border rounded p-1">
              <option value="">-- 種別を選択 --</option>
              {kinds.map(k => (
                <option key={k.id} value={k.id}>{k.name}</option>
              ))}
            </select>
            <Button onClick={handleEditTemplate}>保存</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
