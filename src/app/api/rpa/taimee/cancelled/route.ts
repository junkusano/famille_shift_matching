import { NextRequest } from 'next/server';
import { handleTaimeeMail } from '@/lib/spot-sync/taimeeMail';
export const dynamic = 'force-dynamic';
export const POST = (request: NextRequest) => handleTaimeeMail(request,'cancelled');
