import dbConnect from '@/lib/db';
import Task from '@/models/Task';
import { NextResponse } from 'next/server';

export async function POST(req) {
  await dbConnect();

  try {
    const body = await req.json();
    const task = await Task.create(body);
    return NextResponse.json({ success: true, data: task }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function GET() {
  await dbConnect();

  try {
    const tasks = await Task.find({}).sort({ createdAt: -1 }).limit(50);
    return NextResponse.json({ success: true, data: tasks });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
