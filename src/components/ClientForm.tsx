import { useState } from 'react';
import { apiFetch } from '../lib/api';

interface FormData {
  name: string;
  company: string;
  email: string;
  phone: string;
  role: string;
  notes: string;
  tags: string;
}

interface Props {
  clientId?: string;
  initialData?: Partial<FormData>;
}

export default function ClientForm({ clientId, initialData }: Props) {
  const isEditing = Boolean(clientId);

  const [formData, setFormData] = useState<FormData>({
    name: initialData?.name || '',
    company: initialData?.company || '',
    email: initialData?.email || '',
    phone: initialData?.phone || '',
    role: initialData?.role || '',
    notes: initialData?.notes || '',
    tags: initialData?.tags || ''
  });

  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [loading, setLoading] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name as keyof FormData]) {
      setErrors(prev => ({ ...prev, [name]: undefined }));
    }
  }

  function validate(): boolean {
    const newErrors: Partial<Record<keyof FormData, string>> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    } else if (formData.name.trim().length > 100) {
      newErrors.name = 'Name must be 100 characters or less';
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email format';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!validate()) return;

    setLoading(true);
    setGlobalError(null);

    try {
      const tags = formData.tags
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);

      const payload = {
        name: formData.name.trim(),
        company: formData.company.trim() || null,
        email: formData.email.trim() || null,
        phone: formData.phone.trim() || null,
        role: formData.role.trim() || null,
        notes: formData.notes.trim() || null,
        tags
      };

      const url = isEditing ? `/api/clients/${clientId}` : '/api/clients';
      const method = isEditing ? 'PUT' : 'POST';

      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.details) {
          const fieldErrors: Partial<Record<keyof FormData, string>> = {};
          data.details.forEach((d: { path: string; message: string }) => {
            const field = d.path as keyof FormData;
            fieldErrors[field] = d.message;
          });
          setErrors(fieldErrors);
        } else {
          throw new Error(data.error || 'Failed to save client');
        }
        return;
      }

      // Success - redirect to client page
      window.location.href = `/clients/${data.data.id}`;
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {globalError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {globalError}
        </div>
      )}

      <div className="card p-6 space-y-6">
        <h2 className="font-semibold text-gray-900 border-b border-gray-200 pb-4">
          Basic Information
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Name */}
          <div className="sm:col-span-2">
            <label htmlFor="name" className="label">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="John Smith"
              className={errors.name ? 'input-error' : 'input'}
              disabled={loading}
            />
            {errors.name && <p className="error-text">{errors.name}</p>}
          </div>

          {/* Company */}
          <div>
            <label htmlFor="company" className="label">Company</label>
            <input
              type="text"
              id="company"
              name="company"
              value={formData.company}
              onChange={handleChange}
              placeholder="Acme Inc"
              className={errors.company ? 'input-error' : 'input'}
              disabled={loading}
            />
            {errors.company && <p className="error-text">{errors.company}</p>}
          </div>

          {/* Role */}
          <div>
            <label htmlFor="role" className="label">Role / Title</label>
            <input
              type="text"
              id="role"
              name="role"
              value={formData.role}
              onChange={handleChange}
              placeholder="Product Manager"
              className={errors.role ? 'input-error' : 'input'}
              disabled={loading}
            />
            {errors.role && <p className="error-text">{errors.role}</p>}
          </div>

          {/* Email */}
          <div>
            <label htmlFor="email" className="label">Email</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="john@example.com"
              className={errors.email ? 'input-error' : 'input'}
              disabled={loading}
            />
            {errors.email && <p className="error-text">{errors.email}</p>}
          </div>

          {/* Phone */}
          <div>
            <label htmlFor="phone" className="label">Phone</label>
            <input
              type="tel"
              id="phone"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              placeholder="+1 (555) 123-4567"
              className={errors.phone ? 'input-error' : 'input'}
              disabled={loading}
            />
            {errors.phone && <p className="error-text">{errors.phone}</p>}
          </div>
        </div>
      </div>

      <div className="card p-6 space-y-6">
        <h2 className="font-semibold text-gray-900 border-b border-gray-200 pb-4">
          Additional Details
        </h2>

        {/* Tags */}
        <div>
          <label htmlFor="tags" className="label">Tags</label>
          <input
            type="text"
            id="tags"
            name="tags"
            value={formData.tags}
            onChange={handleChange}
            placeholder="freelance, design, priority (comma-separated)"
            className={errors.tags ? 'input-error' : 'input'}
            disabled={loading}
          />
          <p className="text-xs text-gray-500 mt-1">Separate tags with commas</p>
          {errors.tags && <p className="error-text">{errors.tags}</p>}
        </div>

        {/* Notes */}
        <div>
          <label htmlFor="notes" className="label">Notes</label>
          <textarea
            id="notes"
            name="notes"
            value={formData.notes}
            onChange={handleChange}
            rows={4}
            placeholder="Any initial notes about this client..."
            className={errors.notes ? 'input-error' : 'input'}
            disabled={loading}
          />
          {errors.notes && <p className="error-text">{errors.notes}</p>}
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <a href="/clients" className="btn-secondary">Cancel</a>
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? (
            <>
              <span className="spinner-sm" />
              {isEditing ? 'Saving...' : 'Creating...'}
            </>
          ) : (
            isEditing ? 'Save Changes' : 'Create Client'
          )}
        </button>
      </div>
    </form>
  );
}
