import {
  EMPTY_FORM_VALUES,
  type PaymentLinkFormValues,
  hasErrors,
  parseAmountToPaise,
  toCreateInput,
  validatePaymentLinkForm,
} from './validation'

const NOW = new Date('2026-06-15T10:00:00').getTime()

const valid: PaymentLinkFormValues = {
  amount: '1500.50',
  description: 'Consulting session',
  email: 'priya@example.com',
  phone: '',
  expiresAt: '',
}

const validate = (overrides: Partial<PaymentLinkFormValues>) =>
  validatePaymentLinkForm({ ...valid, ...overrides }, NOW)

describe('validatePaymentLinkForm', () => {
  it('accepts a fully valid form', () => {
    expect(validate({})).toEqual({})
  })

  it('reports every required field on an empty form', () => {
    const errors = validatePaymentLinkForm(EMPTY_FORM_VALUES, NOW)
    expect(errors).toEqual({
      amount: 'Amount is required',
      description: 'Description is required',
      contact: 'Provide a customer email or phone number',
    })
    expect(hasErrors(errors)).toBe(true)
  })

  describe('amount', () => {
    it.each([
      ['0', 'Amount must be greater than ₹0'],
      ['0.00', 'Amount must be greater than ₹0'],
      ['-10', 'Enter a valid amount, e.g. 1500 or 1500.50'],
      ['abc', 'Enter a valid amount, e.g. 1500 or 1500.50'],
      ['1e3', 'Enter a valid amount, e.g. 1500 or 1500.50'],
      ['10.999', 'Amount can have at most 2 decimal places'],
      ['500000.01', 'Amount cannot exceed ₹5,00,000'],
      ['1000000', 'Amount cannot exceed ₹5,00,000'],
    ])('rejects %s', (amount, message) => {
      expect(validate({ amount }).amount).toBe(message)
    })

    it.each(['0.01', '1', '99.9', '500000', '5,00,000.00', ' 250 '])('accepts %s', (amount) => {
      expect(validate({ amount }).amount).toBeUndefined()
    })
  })

  describe('description', () => {
    it('rejects whitespace-only descriptions', () => {
      expect(validate({ description: '   ' }).description).toBe('Description is required')
    })

    it('allows exactly 100 characters and rejects 101', () => {
      expect(validate({ description: 'a'.repeat(100) }).description).toBeUndefined()
      expect(validate({ description: 'a'.repeat(101) }).description).toBe(
        'Description must be 100 characters or fewer',
      )
    })
  })

  describe('customer contact', () => {
    it('requires at least one of email or phone', () => {
      expect(validate({ email: ' ', phone: '' }).contact).toBe(
        'Provide a customer email or phone number',
      )
    })

    it('accepts phone only', () => {
      expect(validate({ email: '', phone: '+91 98765-43210' })).toEqual({})
    })

    it.each(['priya', 'priya@', 'priya@example', 'pri ya@example.com'])(
      'rejects malformed email %s',
      (email) => {
        expect(validate({ email }).email).toMatch(/valid email/)
      },
    )

    it.each(['12345', '5876543210', '+1 9876543210', '98765432101'])(
      'rejects malformed phone %s',
      (phone) => {
        expect(validate({ email: '', phone }).phone).toMatch(/valid 10-digit/)
      },
    )

    it('validates the format of a provided field even when the other one is valid', () => {
      expect(validate({ email: 'priya@example.com', phone: '123' }).phone).toMatch(/valid 10-digit/)
    })
  })

  describe('expiry', () => {
    it('is optional', () => {
      expect(validate({ expiresAt: '' }).expiresAt).toBeUndefined()
    })

    it('must be strictly in the future', () => {
      expect(validate({ expiresAt: '2026-06-15T09:59' }).expiresAt).toBe(
        'Expiry must be in the future',
      )
      expect(validate({ expiresAt: '2026-06-15T10:00' }).expiresAt).toBe(
        'Expiry must be in the future',
      )
      expect(validate({ expiresAt: '2026-06-15T10:01' }).expiresAt).toBeUndefined()
    })

    it('rejects unparseable dates', () => {
      expect(validate({ expiresAt: 'not-a-date' }).expiresAt).toBe('Enter a valid date and time')
    })
  })
})

describe('toCreateInput', () => {
  it('normalises values into the API payload', () => {
    expect(
      toCreateInput({
        amount: '1,500.5',
        description: '  Invoice #42  ',
        email: '',
        phone: '98765 43210',
        expiresAt: '2026-06-20T18:30',
      }),
    ).toEqual({
      amountPaise: 150050,
      description: 'Invoice #42',
      customer: { phone: '9876543210' },
      expiresAt: new Date('2026-06-20T18:30').toISOString(),
    })
  })

  it('converts to paise exactly, without floating point drift', () => {
    expect(parseAmountToPaise('0.29')).toBe(29) // 0.29 * 100 === 28.999999999999996
    expect(parseAmountToPaise('4.35')).toBe(435) // 4.35 * 100 === 434.99999999999994
    expect(parseAmountToPaise('500000')).toBe(50_000_000)
    expect(parseAmountToPaise('1.005')).toBeNull()
  })
})
