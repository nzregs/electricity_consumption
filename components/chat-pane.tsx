"use client"

import { useState, useRef, useEffect } from "react"
import { Send } from "lucide-react"

interface Message {
  role: "user" | "assistant"
  content: string
}

export function ChatPane() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || loading) return

    const userMsg: Message = { role: "user", content: text }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput("")
    setLoading(true)

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
      })
      const data = await res.json()
      const assistantMsg: Message = {
        role: "assistant",
        content: data.reply || data.error || "Something went wrong.",
      }
      setMessages([...newMessages, assistantMsg])
    } catch {
      setMessages([
        ...newMessages,
        { role: "assistant", content: "Failed to connect. Please try again." },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full rounded-xl border border-border overflow-hidden" style={{ backgroundColor: "var(--octopus-dark-purple)" }}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-border shrink-0">
        <h3 className="text-sm font-medium" style={{ color: "var(--octopus-white)" }}>
          Ask about your data
        </h3>
        <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
          Powered by Snowflake CoWork
        </p>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-xs space-y-2 pt-4" style={{ color: "var(--muted-foreground)" }}>
            <p>Try asking:</p>
            <button
              onClick={() => setInput("What was my total electricity usage last month?")}
              className="block w-full text-left px-3 py-2 rounded-lg border border-border hover:bg-[var(--octopus-mid-purple)] transition-colors text-xs"
            >
              What was my total electricity usage last month?
            </button>
            <button
              onClick={() => setInput("Which day of the week do I use the most power?")}
              className="block w-full text-left px-3 py-2 rounded-lg border border-border hover:bg-[var(--octopus-mid-purple)] transition-colors text-xs"
            >
              Which day of the week do I use the most power?
            </button>
            <button
              onClick={() => setInput("What's my average daily cost?")}
              className="block w-full text-left px-3 py-2 rounded-lg border border-border hover:bg-[var(--octopus-mid-purple)] transition-colors text-xs"
            >
              What&apos;s my average daily cost?
            </button>
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] px-3 py-2 rounded-xl text-sm ${
                msg.role === "user"
                  ? "rounded-br-sm"
                  : "rounded-bl-sm"
              }`}
              style={
                msg.role === "user"
                  ? { backgroundColor: "var(--octopus-cyan)", color: "var(--octopus-deep-navy)" }
                  : { backgroundColor: "var(--octopus-mid-purple)", color: "var(--octopus-white)" }
              }
            >
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div
              className="px-3 py-2 rounded-xl rounded-bl-sm text-sm"
              style={{ backgroundColor: "var(--octopus-mid-purple)", color: "var(--muted-foreground)" }}
            >
              <span className="inline-flex gap-1">
                <span className="animate-pulse">.</span>
                <span className="animate-pulse" style={{ animationDelay: "0.2s" }}>.</span>
                <span className="animate-pulse" style={{ animationDelay: "0.4s" }}>.</span>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-3 py-3 border-t border-border shrink-0">
        <form
          onSubmit={(e) => { e.preventDefault(); sendMessage() }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question..."
            disabled={loading}
            className="flex-1 px-3 py-2 rounded-lg border border-border text-sm bg-transparent outline-none focus:border-[var(--octopus-cyan)] transition-colors"
            style={{ color: "var(--octopus-white)" }}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="p-2 rounded-lg transition-colors disabled:opacity-40"
            style={{ backgroundColor: "var(--octopus-cyan)", color: "var(--octopus-deep-navy)" }}
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  )
}
