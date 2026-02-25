// src/features/quickCapture/services/quickCaptureService.ts
// Data access layer for Quick Capture feature

import { supabase } from '../../../lib/supabase';
import type {
  QuickCapture,
  QuickCaptureAttachment,
  CreateQuickCapturePayload,
  UpdateQuickCapturePayload,
  ListQuickCapturesOptions,
} from '../types';

const BUCKET = 'quick-capture-attachments';

// ============================================================================
// Quick Captures CRUD
// ============================================================================

export async function createQuickCapture(
  data: CreateQuickCapturePayload
): Promise<{ data: QuickCapture | null; error: Error | null }> {
  try {
    const { data: row, error } = await supabase
      .from('quick_captures')
      .insert({
        first_name: data.first_name,
        last_name: data.last_name || null,
        email: data.email || null,
        phone: data.phone || null,
        realtor_id: data.realtor_id || null,
        notes: data.notes || null,
      })
      .select()
      .single();

    if (error) {
      console.error('[quickCapture] create error:', error.message);
      return { data: null, error: new Error(error.message) };
    }

    return { data: row as QuickCapture, error: null };
  } catch (err: any) {
    console.error('[quickCapture] create exception:', err);
    return { data: null, error: err };
  }
}

export async function updateQuickCapture(
  id: string,
  patch: UpdateQuickCapturePayload
): Promise<{ data: QuickCapture | null; error: Error | null }> {
  try {
    const updateData: any = { ...patch, last_touched_at: new Date().toISOString() };

    const { data: row, error } = await supabase
      .from('quick_captures')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[quickCapture] update error:', error.message);
      return { data: null, error: new Error(error.message) };
    }

    return { data: row as QuickCapture, error: null };
  } catch (err: any) {
    console.error('[quickCapture] update exception:', err);
    return { data: null, error: err };
  }
}

export async function listQuickCaptures(
  options: ListQuickCapturesOptions = {}
): Promise<{ data: QuickCapture[]; error: Error | null }> {
  try {
    let query = supabase
      .from('quick_captures')
      .select(`
        *,
        realtors ( id, first_name, last_name )
      `)
      .order('last_touched_at', { ascending: false });

    if (options.status) {
      query = query.eq('status', options.status);
    }

    const { data: rows, error } = await query;

    if (error) {
      console.error('[quickCapture] list error:', error.message);
      return { data: [], error: new Error(error.message) };
    }

    // Map joined realtor data into flat fields
    const captures: QuickCapture[] = (rows || []).map((row: any) => ({
      id: row.id,
      created_at: row.created_at,
      created_by_user_id: row.created_by_user_id,
      first_name: row.first_name,
      last_name: row.last_name,
      email: row.email,
      phone: row.phone,
      realtor_id: row.realtor_id,
      notes: row.notes,
      status: row.status,
      converted_lead_id: row.converted_lead_id,
      last_touched_at: row.last_touched_at,
      realtor_first_name: row.realtors?.first_name || null,
      realtor_last_name: row.realtors?.last_name || null,
    }));

    // Client-side search filter
    if (options.query) {
      const q = options.query.toLowerCase();
      return {
        data: captures.filter(
          (c) =>
            c.first_name.toLowerCase().includes(q) ||
            c.last_name?.toLowerCase().includes(q) ||
            c.phone?.toLowerCase().includes(q) ||
            c.email?.toLowerCase().includes(q) ||
            c.notes?.toLowerCase().includes(q)
        ),
        error: null,
      };
    }

    return { data: captures, error: null };
  } catch (err: any) {
    console.error('[quickCapture] list exception:', err);
    return { data: [], error: err };
  }
}

export async function convertQuickCaptureToLead(
  captureId: string,
  userId: string
): Promise<{ leadId: string | null; error: Error | null }> {
  try {
    // 1. Fetch the quick capture
    const { data: capture, error: fetchError } = await fetchQuickCapture(captureId);
    if (fetchError || !capture) {
      return { leadId: null, error: fetchError || new Error('Capture not found') };
    }

    if (capture.status === 'converted') {
      return { leadId: capture.converted_lead_id, error: new Error('Already converted') };
    }

    // 2. Resolve lo_id from loan_officers table
    let loId: string | null = null;
    const { data: loData } = await supabase
      .from('loan_officers')
      .select('id')
      .eq('user_id', userId)
      .eq('active', true)
      .maybeSingle();
    if (loData) {
      loId = loData.id;
    }

    // 3. Build the lead row
    const fullName = [capture.first_name, capture.last_name].filter(Boolean).join(' ');
    const leadData = {
      name: fullName,
      first_name: capture.first_name,
      last_name: capture.last_name || null,
      phone: capture.phone || null,
      email: capture.email || null,
      realtor_id: capture.realtor_id || null,
      message: capture.notes || null,
      source: 'My Lead',
      source_detail: captureId,
      status: 'new',
      lo_id: loId,
      loan_purpose: 'Home Buying',
    };

    const { data: lead, error: insertError } = await supabase
      .from('leads')
      .insert([leadData])
      .select()
      .single();

    if (insertError || !lead) {
      console.error('[quickCapture] convert insert error:', insertError?.message);
      return { leadId: null, error: new Error(insertError?.message || 'Failed to create lead') };
    }

    // 4. Mark quick capture as converted
    const { error: updateError } = await supabase
      .from('quick_captures')
      .update({
        status: 'converted',
        converted_lead_id: lead.id,
        last_touched_at: new Date().toISOString(),
      })
      .eq('id', captureId);

    if (updateError) {
      console.error('[quickCapture] convert status update error:', updateError.message);
      // Lead was created, so return it even if status update failed
    }

    return { leadId: lead.id, error: null };
  } catch (err: any) {
    console.error('[quickCapture] convert exception:', err);
    return { leadId: null, error: err };
  }
}

export async function deleteQuickCapture(
  id: string
): Promise<{ error: Error | null }> {
  try {
    // 1. Fetch attachments to clean up storage files
    const { data: attachments } = await fetchAttachments(id);
    if (attachments.length > 0) {
      const filePaths = attachments.map((a) => a.file_path);
      await supabase.storage.from(BUCKET).remove(filePaths);
    }

    // 2. Delete attachment rows (cascade should handle this, but be explicit)
    await supabase
      .from('quick_capture_attachments')
      .delete()
      .eq('quick_capture_id', id);

    // 3. Delete the quick capture row
    const { error } = await supabase
      .from('quick_captures')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[quickCapture] delete error:', error.message);
      return { error: new Error(error.message) };
    }

    return { error: null };
  } catch (err: any) {
    console.error('[quickCapture] delete exception:', err);
    return { error: err };
  }
}

export async function fetchQuickCapture(
  id: string
): Promise<{ data: QuickCapture | null; error: Error | null }> {
  try {
    const { data: row, error } = await supabase
      .from('quick_captures')
      .select(`
        *,
        realtors ( id, first_name, last_name )
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error('[quickCapture] fetch error:', error.message);
      return { data: null, error: new Error(error.message) };
    }

    const r = row as any;
    const capture: QuickCapture = {
      ...r,
      realtor_first_name: r.realtors?.first_name || null,
      realtor_last_name: r.realtors?.last_name || null,
    };
    delete (capture as any).realtors;

    return { data: capture, error: null };
  } catch (err: any) {
    console.error('[quickCapture] fetch exception:', err);
    return { data: null, error: err };
  }
}

// ============================================================================
// Attachments
// ============================================================================

export async function fetchAttachments(
  quickCaptureId: string
): Promise<{ data: QuickCaptureAttachment[]; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('quick_capture_attachments')
      .select('*')
      .eq('quick_capture_id', quickCaptureId)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('[quickCapture] fetchAttachments error:', error.message);
      return { data: [], error: new Error(error.message) };
    }

    return { data: (data || []) as QuickCaptureAttachment[], error: null };
  } catch (err: any) {
    console.error('[quickCapture] fetchAttachments exception:', err);
    return { data: [], error: err };
  }
}

export async function uploadQuickCaptureAttachment(params: {
  quickCaptureId: string;
  compressedUri: string;
  mimeType?: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
  sortOrder?: number;
}): Promise<{ data: QuickCaptureAttachment | null; error: Error | null }> {
  try {
    const {
      quickCaptureId,
      compressedUri,
      mimeType = 'image/jpeg',
      width,
      height,
      sizeBytes,
      sortOrder = 0,
    } = params;

    // 1. Read compressed file as ArrayBuffer
    const response = await fetch(compressedUri);
    const arrayBuffer = await response.arrayBuffer();

    // 2. Build storage path
    const ext = mimeType === 'image/png' ? 'png' : 'jpg';
    const fileName = `photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const filePath = `${quickCaptureId}/${fileName}`;

    // 3. Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, arrayBuffer, { contentType: mimeType });

    if (uploadError || !uploadData) {
      console.error('[quickCapture] upload error:', uploadError);
      return { data: null, error: uploadError || new Error('Upload failed') };
    }

    // 4. Get public URL
    const { data: publicUrlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(uploadData.path);

    const fileUrl = publicUrlData?.publicUrl;
    if (!fileUrl) {
      return { data: null, error: new Error('No public URL returned') };
    }

    // 5. Insert attachment row
    const { data: attachment, error: insertError } = await supabase
      .from('quick_capture_attachments')
      .insert({
        quick_capture_id: quickCaptureId,
        file_path: filePath,
        file_url: fileUrl,
        mime_type: mimeType,
        width: width || null,
        height: height || null,
        size_bytes: sizeBytes || arrayBuffer.byteLength,
        sort_order: sortOrder,
      })
      .select()
      .single();

    if (insertError) {
      console.error('[quickCapture] insert attachment error:', insertError.message);
      return { data: null, error: new Error(insertError.message) };
    }

    return { data: attachment as QuickCaptureAttachment, error: null };
  } catch (err: any) {
    console.error('[quickCapture] uploadAttachment exception:', err);
    return { data: null, error: err };
  }
}

export async function deleteQuickCaptureAttachment(
  attachmentId: string,
  filePath: string
): Promise<{ error: Error | null }> {
  try {
    // 1. Delete from storage
    const { error: storageError } = await supabase.storage
      .from(BUCKET)
      .remove([filePath]);

    if (storageError) {
      console.error('[quickCapture] delete storage error:', storageError.message);
      // Continue to delete the row even if storage delete fails
    }

    // 2. Delete the DB row
    const { error: dbError } = await supabase
      .from('quick_capture_attachments')
      .delete()
      .eq('id', attachmentId);

    if (dbError) {
      console.error('[quickCapture] delete attachment row error:', dbError.message);
      return { error: new Error(dbError.message) };
    }

    return { error: null };
  } catch (err: any) {
    console.error('[quickCapture] deleteAttachment exception:', err);
    return { error: err };
  }
}
