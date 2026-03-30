import React from 'react';
import { Pencil, Trash2 } from 'lucide-react';

interface User {
    id: string;
    name: string;
    email: string;
    role: 'admin' | 'user';
}

interface UserListProps {
    users: User[];
    onEdit: (user: User) => void;
    onDelete: (id: string) => void;
}

const UserList: React.FC<UserListProps> = ({ users, onEdit, onDelete }) => {
    return (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            <table>
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Role</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {users.map(user => (
                        <tr key={user.id}>
                            <td>{user.name}</td>
                            <td style={{ color: 'var(--text-muted)' }}>{user.email}</td>
                            <td>
                                <span style={{
                                    padding: '0.15rem 0.5rem', borderRadius: '2px', fontSize: '12px', fontWeight: 600,
                                    background: user.role === 'admin' ? 'var(--primary-light)' : 'var(--bg-body)',
                                    color: user.role === 'admin' ? 'var(--primary)' : 'var(--text-muted)',
                                    border: '1px solid var(--border-color)'
                                }}>
                                    {user.role}
                                </span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                                <button onClick={() => onEdit(user)} className="btn btn-ghost"
                                    style={{ padding: '0.25rem', marginRight: '0.25rem' }} title="Edit">
                                    <Pencil size={15} />
                                </button>
                                <button onClick={() => onDelete(user.id)} className="btn btn-ghost"
                                    style={{ padding: '0.25rem', color: 'var(--danger)' }} title="Delete">
                                    <Trash2 size={15} />
                                </button>
                            </td>
                        </tr>
                    ))}
                    {users.length === 0 && (
                        <tr><td colSpan={4} style={{ textAlign: 'center' }} className="text-muted">No users found.</td></tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};

export default UserList;
