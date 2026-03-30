const escapeHtml = (str: string): string =>
    str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');

export const getBaseEmailHtml = (content: string): string => `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { font-family: 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #334155; margin: 0; padding: 0; background-color: #f1f5f9; }
        .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); color: #ffffff; padding: 30px 20px; text-align: center; }
        .header h1 { margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px; }
        .content { padding: 40px 30px; }
        .task-card { background: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #3b82f6; padding: 20px; margin: 25px 0; border-radius: 6px; }
        .label { font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 700; letter-spacing: 0.05em; margin-bottom: 4px; }
        .value { font-size: 15px; color: #0f172a; margin-bottom: 16px; font-weight: 500; font-family: 'Segoe UI', sans-serif; }
        .value:last-child { margin-bottom: 0; }
        .footer { background-color: #f8fafc; padding: 20px; text-align: center; color: #94a3b8; font-size: 12px; border-top: 1px solid #e2e8f0; }
        .button { display: inline-block; padding: 12px 24px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; margin-top: 10px; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2); transition: background-color 0.2s; }
        .button:hover { background-color: #1d4ed8; }
        .info-box { background-color: #eff6ff; border: 1px solid #dbeafe; color: #1e40af; padding: 15px; border-radius: 6px; margin-bottom: 25px; font-size: 14px; }
        h2 { color: #0f172a; font-size: 20px; font-weight: 600; margin-top: 0; margin-bottom: 15px; }
        p { margin-bottom: 15px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Wartungskalender</h1>
        </div>
        <div class="content">
            ${content}
        </div>
        <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Wartungskalender System. <br>Automated Notification.</p>
        </div>
    </div>
</body>
</html>
`;

export const getWelcomeEmailHtml = (name: string, email: string, password: string): string => {
    return getBaseEmailHtml(`
        <h2 style="color: #0f172a; margin-top: 0;">Welcome, ${escapeHtml(name)}!</h2>
        <p>Your account has been successfully created. You can now access the Maintenance Calendar system.</p>

        <div class="task-card" style="border-left-color: #10b981;">
            <div class="label">Login Email</div>
            <div class="value">${escapeHtml(email)}</div>

            <div class="label">Temporary Password</div>
            <div class="value" style="font-family: monospace; letter-spacing: 1px; background: #e2e8f0; padding: 4px 8px; border-radius: 4px; display: inline-block;">${escapeHtml(password)}</div>
        </div>
        
        <div class="info-box">
            <strong>Security Tip:</strong> Please change your password immediately after your first login into the system.
        </div>

        <div style="text-align: center;">
            <a href="${window.location.origin}" class="button" style="background-color: #10b981;">Login Now</a>
        </div>
    `);
};

export const getTaskAssignmentEmailHtml = (taskTitle: string, taskDate: string, taskDescription?: string): string => {
    return getBaseEmailHtml(`
        <h2 style="color: #0f172a; margin-top: 0;">New Task Assigned</h2>
        <p>You have been assigned to a new maintenance task.</p>

        <div class="task-card">
            <div class="label">Task Title</div>
            <div class="value">${escapeHtml(taskTitle)}</div>

            <div class="label">Due Date</div>
            <div class="value">${escapeHtml(new Date(taskDate).toLocaleDateString())}</div>

            <div class="label">Description</div>
            <div class="value" style="white-space: pre-wrap;">${escapeHtml(taskDescription ?? 'No description provided.')}</div>
        </div>

        <div style="text-align: center;">
            <a href="${window.location.origin}" class="button">View Task</a>
        </div>
    `);
};
