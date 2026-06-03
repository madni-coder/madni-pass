import { NextResponse } from "next/server";

export async function POST(request) {
    try {
        const { email, code } = await request.json();
        
        if (!email || !code) {
            return NextResponse.json({ error: "Missing email or code" }, { status: 400 });
        }

        const apiKey = process.env.RESEND_API_KEY;
        if (!apiKey) {
            console.log("\n=========================================");
            console.log(`[DEV MODE] RESET CODE FOR ${email}: ${code}`);
            console.log("=========================================\n");
            return NextResponse.json({ 
                success: true, 
                devMode: true, 
                message: "No API key found. Code logged to console." 
            });
        }

        const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                from: "Madni Pass <noreply@lazynote.website>",
                to: [email],
                subject: "Reset your Madni Pass PIN",
                html: `
                    <div style="font-family: sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #eaeaea; border-radius: 5px;">
                        <h2 style="color: #4cc9d0; margin-bottom: 20px;">Madni Pass Recovery</h2>
                        <p>You requested a PIN reset for your Madni Pass account.</p>
                        <p>Your 6-digit verification code is:</p>
                        <div style="background-color: #f6f6f6; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; border-radius: 5px; color: #333; margin: 20px 0;">
                            ${code}
                        </div>
                        <p style="font-size: 12px; color: #666; margin-top: 30px;">This code will expire in 5 minutes. If you did not request this, please ignore this email.</p>
                    </div>
                `
            })
        });

        const data = await res.json();
        if (!res.ok) {
            return NextResponse.json({ error: data.message || "Failed to send email" }, { status: res.status });
        }

        return NextResponse.json({ success: true, messageId: data.id });
    } catch (err) {
        return NextResponse.json({ error: err.message || "Server Error" }, { status: 500 });
    }
}
