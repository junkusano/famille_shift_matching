'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Checkbox } from '@/components/ui/checkbox';

type TemplateWithKind = {
  id: string;
  name: string;
  description: string;
  rpa_command_kind: {
    name: string | null;
  }[];  // 配列で型定義
};



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

export default function RpaCommandTemplateListPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [args, setArgs] = useState<Arg[]>([]);
  const [types, setTypes] = useState<CommandType[]>([]);

  useEffect(() => {
    fetchTemplates();
    fetchArgs();
    fetchTypes();
  }, []);

  const fetchTemplates = async () => {
    const { data, error } = await supabase
      .from('rpa_command_templates')
      .select(`
    id,
    name,
    description,
    rpa_command_kind (
      name
    )
  `)
      .order('created_at');

    if (error) {
      console.error('Fetch templates error:', error);
      return;
    }

    if (data) {
      const formatted = (data as TemplateWithKind[]).map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        kind_name: t.rpa_command_kind[0]?.name ?? ''
      }));
      setTemplates(formatted);
    }

  };

  const fetchArgs = async () => {
    const { data, error } = await supabase
      .from('rpa_command_args')
      .select('*')
      .order('sort_order');
    if (error) {
      console.error('Fetch args error:', error);
      return;
    }
    setArgs(data || []);
  };

  const fetchTypes = async () => {
    const { data, error } = await supabase
      .from('rpa_command_type')
      .select('name')
      .order('sort_order');
    if (error) {
      console.error('Fetch types error:', error);
      return;
    }
    setTypes(data || []);
  };

  const handleArgChange = (id: string, field: keyof Arg, value: string | number | boolean) => {
    setArgs(args.map(arg => arg.id === id ? { ...arg, [field]: value } : arg));
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
    if (!error) {
      setArgs(args.filter(a => a.id !== id));
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
              <div>▼</div>
            </AccordionTrigger>
            <AccordionContent className="border p-2">
              <div className="grid grid-cols-6 gap-2 font-bold border-b py-1 bg-gray-100">
                <div>key</div>
                <div>label</div>
                <div>type</div>
                <div>必須</div>
                <div>並び順</div>
                <div>操作</div>
              </div>
              {args.filter(a => a.template_id === template.id).map(arg => (
                <div key={arg.id} className="grid grid-cols-6 gap-2 items-center border-b py-1">
                  <Input value={arg.key} onChange={(e) => handleArgChange(arg.id, 'key', e.target.value)} />
                  <Input value={arg.label} onChange={(e) => handleArgChange(arg.id, 'label', e.target.value)} />
                  <select
                    value={arg.type}
                    onChange={(e) => handleArgChange(arg.id, 'type', e.target.value)}
                    className="border rounded p-1"
                  >
                    {types.map(t => (
                      <option key={t.name} value={t.name}>{t.name}</option>
                    ))}
                  </select>
                  <Checkbox
                    checked={arg.required}
                    onCheckedChange={(val) => handleArgChange(arg.id, 'required', !!val)}
                  />
                  <Input
                    type="number"
                    value={arg.sort_order}
                    onChange={(e) => handleArgChange(arg.id, 'sort_order', parseInt(e.target.value))}
                  />
                  <div className="flex gap-1">
                    <Button size="sm" onClick={() => handleSaveArg(arg.id)}>保存</Button>
                    <Button size="sm" variant="destructive" onClick={() => handleDeleteArg(arg.id)}>削除</Button>
                  </div>
                </div>
              ))}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
