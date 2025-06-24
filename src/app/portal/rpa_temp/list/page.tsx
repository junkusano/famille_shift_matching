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
  kind_name?: string;
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

type TemplateWithKind = Template & {
  rpa_command_kind?: {
    name?: string;
  };
};

export default function RpaCommandTemplateListPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [args, setArgs] = useState<Arg[]>([]);
  const [types, setTypes] = useState<CommandType[]>([]);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const [newKey, setNewKey] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState('text');
  const [newRequired, setNewRequired] = useState(false);
  const [newSortOrder, setNewSortOrder] = useState(0);

  useEffect(() => {
    fetchTemplates();
    fetchArgs();
    fetchTypes();
  }, []);

  const fetchTemplates = async () => {
    const { data, error } = await supabase
      .from('rpa_command_templates')
      .select('*, rpa_command_kind (name)')
      .order('created_at');

    if (error) {
      console.error('Fetch templates error:', error);
    } else if (data) {
      const formatted = (data as TemplateWithKind[]).map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        kind_name: t.rpa_command_kind?.name ?? ''
      }));
      setTemplates(formatted);
    }
  };

  const fetchArgs = async () => {
    const { data, error } = await supabase.from('rpa_command_args').select('*').order('sort_order');
    if (error) {
      console.error('Fetch args error:', error);
    } else if (data) {
      setArgs(data as Arg[]);
    }
  };

  const fetchTypes = async () => {
    const { data, error } = await supabase.from('rpa_command_type').select('name').order('sort_order');
    if (error) {
      console.error('Fetch types error:', error);
    } else if (data) {
      setTypes(data as CommandType[]);
    }
  };

  const handleAddTemplate = async () => {
    if (!newName) return;
    const { data, error } = await supabase.from('rpa_command_templates').insert([
      { name: newName, description: newDescription }
    ]).select();
    if (!error && data) {
      setTemplates([...templates, ...data.map((t) => ({
        ...t,
        kind_name: ''
      }))]);
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
        sort_order: newSortOrder
      }
    ]).select();
    if (!error && data) {
      setArgs([...args, ...data]);
      setNewKey('');
      setNewLabel('');
      setNewType('text');
      setNewRequired(false);
      setNewSortOrder(0);
    }
  };

  const handleArgChange = (id: string, field: keyof Arg, value: string | number | boolean) => {
    setArgs(args.map(arg => arg.id === id ? { ...arg, [field]: value } : arg));
  };

  const handleSaveArg = async (id: string) => {
    const arg = args.find(a => a.id === id);
    if (arg) {
      const { error } = await supabase.from('rpa_command_args')
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
    if (!error) setArgs(args.filter(a => a.id !== id));
  };

  const handleDeleteTemplate = async (id: string) => {
    const { error } = await supabase.from('rpa_command_templates').delete().eq('id', id);
    if (!error) {
      setTemplates(templates.filter(t => t.id !== id));
      setArgs(args.filter(a => a.template_id !== id));
    }
  };

  return (
    <div className="content">
      <h1 className="text-2xl font-bold mb-4">RPA コマンドテンプレート管理</h1>
      {/* UI部分は前回コードと同様。省略可。必要ならここに書きます。 */}
    </div>
  );
}
