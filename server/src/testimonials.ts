import type { PublicTestimonial, TestimonialSubmission } from '@pmw/validation';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface TestimonialsBackend {
  listApproved(): Promise<PublicTestimonial[]>;
  submit(input: TestimonialSubmission): Promise<void>;
}

const publicColumns = 'id,name,city,service,body,submitted_at';

export function createTestimonialsBackend(
  client: Pick<SupabaseClient, 'from'>,
): TestimonialsBackend {
  return {
    async listApproved() {
      const { data, error } = await client
        .from('testimonials')
        .select(publicColumns)
        .eq('status', 'approved')
        .eq('can_publish', true)
        .order('submitted_at', { ascending: false })
        .order('id', { ascending: false });
      if (error || !data) throw new Error('Testimonials could not be loaded.');
      return data as PublicTestimonial[];
    },
    async submit(input) {
      const { error } = await client.from('testimonials').insert({
        name: input.name,
        email: input.email,
        body: input.body,
        can_publish: input.can_publish,
        photo_contact_ok: input.photo_contact_ok,
        status: 'pending',
      });
      if (error) throw new Error('Testimonial could not be saved.');
    },
  };
}
