"use client";

import { useEffect, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function FaxPage() {
  const [data, setData] = useState<FaxData[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      const res = await fetch("/api/fax");
      const result = await res.json();
      setData(result);
    };
    fetchData();
  }, []);

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">FAX番号帳</h1>
      <Table className="w-full">
        <TableHeader>
          <TableRow>
            <TableHead>FAX番号</TableHead>
            <TableHead>事業所名</TableHead>
            <TableHead>メール</TableHead>
            <TableHead>サービス種別</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((item) => (
            <TableRow key={item.fax}>
              <TableCell>{item.fax}</TableCell>
              <TableCell>{item.office_name}</TableCell>
              <TableCell>{item.email}</TableCell>
              <TableCell>{item.service_kind}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

interface FaxData {
  fax: string;
  office_name: string;
  email: string;
  service_kind: string;
}
