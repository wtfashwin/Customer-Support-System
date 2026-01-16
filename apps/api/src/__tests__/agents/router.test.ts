import { describe, it, expect, beforeAll, vi } from 'vitest'
import { AgentService } from '../../services/agent.service'

// Mock Anthropic
const mockCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => {
    return {
        default: vi.fn().mockImplementation(() => ({
            messages: {
                create: mockCreate
            }
        }))
    }
})

describe('AgentService - Routing', () => {
    let agentService: AgentService

    beforeAll(() => {
        // Mock process.env.ANTHROPIC_API_KEY to avoid error in constructor
        process.env.ANTHROPIC_API_KEY = 'mock-key'
        agentService = new AgentService()
    })

    it('should route order query to Order Agent', async () => {
        mockCreate.mockResolvedValueOnce({
            content: [{
                type: 'text', text: JSON.stringify({
                    agent: 'order',
                    confidence: 0.9,
                    reasoning: 'User mentions order number',
                    entities: ['ORD-1234']
                })
            }]
        })

        const decision = await agentService.routeMessage(
            'Where is my order ORD-1234?',
            []
        )

        expect(decision.agent).toBe('order')
        expect(decision.confidence).toBe(0.9)
        expect(decision.entities).toContain('ORD-1234')
    })

    it('should route billing query to Billing Agent', async () => {
        mockCreate.mockResolvedValueOnce({
            content: [{
                type: 'text', text: JSON.stringify({
                    agent: 'billing',
                    confidence: 0.95,
                    reasoning: 'User mentions refund and invoice',
                    entities: ['INV-5678']
                })
            }]
        })

        const decision = await agentService.routeMessage(
            'I need a refund for invoice INV-5678',
            []
        )

        expect(decision.agent).toBe('billing')
        expect(decision.confidence).toBeGreaterThan(0.9)
    })

    it('should default to Support Agent when confidence is low', async () => {
        // Mock returns "order" but with low confidence
        mockCreate.mockResolvedValueOnce({
            content: [{
                type: 'text', text: JSON.stringify({
                    agent: 'order',
                    confidence: 0.4,
                    reasoning: 'Unclear query',
                    entities: []
                })
            }]
        })

        const decision = await agentService.routeMessage(
            'Hello, I need help with something',
            []
        )

        expect(decision.agent).toBe('support')
        expect(decision.reasoning).toContain('Low confidence')
    })
})
