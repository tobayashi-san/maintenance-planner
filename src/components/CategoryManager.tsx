import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import { Plus, Trash2 } from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
import { generateId } from '../utils/id';

const CategoryManager: React.FC = () => {
    const { categories, addCategory, deleteCategory } = useStore();
    const { showToast } = useNotification();
    const [name, setName] = useState('');
    const [color, setColor] = useState('#1d4ed8');

    const handleAdd = async () => {
        if (!name.trim()) return;
        await addCategory({ id: generateId(), name, color });
        setName('');
        showToast('Category added.', 'success');
    };

    const handleDelete = async (id: string) => {
        if (confirm('Delete this category?')) {
            await deleteCategory(id);
            showToast('Category deleted.', 'success');
        }
    };

    return (
        <div>
            <p className="text-muted" style={{ marginBottom: '1rem' }}>Manage task categories and colors.</p>
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', alignItems: 'flex-end' }}>
                <div style={{ flex: 2 }}>
                    <label style={{ display: 'block', marginBottom: '0.375rem', fontWeight: 500, fontSize: '13px' }}>Name</label>
                    <input className="input" type="text" value={name} onChange={e => setName(e.target.value)}
                        placeholder="e.g. Server, network..." onKeyDown={e => e.key === 'Enter' && handleAdd()} />
                </div>
                <div style={{ flex: '0 0 auto' }}>
                    <label style={{ display: 'block', marginBottom: '0.375rem', fontWeight: 500, fontSize: '13px' }}>Color</label>
                    <input type="color" value={color} onChange={e => setColor(e.target.value)}
                        style={{ width: '56px', height: '34px', padding: '2px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', cursor: 'pointer' }} />
                </div>
                <button className="btn btn-primary" onClick={handleAdd}><Plus size={14} /> Add</button>
            </div>

            {categories.length === 0 ? (
                <p className="text-muted">No categories yet.</p>
            ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                    {categories.map(cat => (
                        <div key={cat.id} style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            padding: '0.3rem 0.625rem', borderRadius: '2px',
                            background: 'var(--bg-body)', border: '1px solid var(--border-color)',
                            color: 'var(--text-main)', fontSize: '13px'
                        }}>
                            <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: cat.color, flexShrink: 0 }} />
                            <span>{cat.name}</span>
                            <button onClick={() => handleDelete(cat.id)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-muted)', display: 'flex' }}>
                                <Trash2 size={13} />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default CategoryManager;
