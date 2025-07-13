"use client";

import { useEffect, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";

interface FaxData {
  fax: string;
  title: string;
  download_url: string;
  created_at: string;
}

export default function FaxPage() {
  const [data, setData] = useState<FaxData[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch("/api/fax");
        if (!response.ok) {
          throw new Error("Network response was not ok");
        }
        const result = await response.json();
        setData(result);
      } catch (error) {
        console.error("Fetch error:", error);
      }
    };

    fetchData();
  }, []);

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">FAX一覧</h1>
      <Table className="w-full">
        <TableHeader>
          <TableRow>
            <TableHead>FAX番号</TableHead>
            <TableHead>タイトル</TableHead>
            <TableHead>作成日</TableHead>
            <TableHead>ダウンロード</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((item) => (
            <TableRow key={item.fax}>
              <TableCell>{item.fax}</TableCell>
              <TableCell>{item.title}</TableCell>
              <TableCell>{new Date(item.created_at).toLocaleString()}</TableCell>
              <TableCell>
                <a href={item.download_url} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline">PDF</Button>
                </a>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
