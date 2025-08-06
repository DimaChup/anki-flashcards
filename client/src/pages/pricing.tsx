import { useState } from 'react';
import { useLocation } from 'wouter';
import { Check, Zap, Crown, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function Pricing() {
  const [, setLocation] = useLocation();
  const [isAnnual, setIsAnnual] = useState(false);

  const plans = [
    {
      name: 'Free',
      description: 'Perfect for trying out linguistic analysis',
      icon: <Check className="h-6 w-6" />,
      price: { monthly: 0, annual: 0 },
      features: [
        '1,000 words/month analysis',
        '3 linguistic databases',
        'Basic prompt templates',
        'CSV export',
        'Community support'
      ],
      limitations: [
        'No AI processing',
        'No custom prompts',
        'No advanced features'
      ],
      cta: 'Get Started Free',
      popular: false
    },
    {
      name: 'Pro',
      description: 'For researchers and language professionals',
      icon: <Zap className="h-6 w-6" />,
      price: { monthly: 29, annual: 290 },
      features: [
        '50,000 words/month analysis',
        'Unlimited databases',
        'AI-powered processing',
        'Custom prompt templates',
        'Advanced POS analysis',
        'Batch processing',
        'Priority support',
        'JSON/CSV export'
      ],
      limitations: [],
      cta: 'Start Pro Trial',
      popular: true
    },
    {
      name: 'Enterprise',
      description: 'For institutions and large-scale projects',
      icon: <Crown className="h-6 w-6" />,
      price: { monthly: 99, annual: 990 },
      features: [
        'Unlimited word analysis',
        'Unlimited databases',
        'Premium AI models',
        'Custom prompts & templates',
        'Team collaboration',
        'API access',
        'White-label options',
        'Dedicated support',
        'Custom integrations'
      ],
      limitations: [],
      cta: 'Contact Sales',
      popular: false
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-4xl font-bold text-foreground mb-4">
            Choose Your Linguistic Analysis Plan
          </h1>
          <p className="text-xl text-muted-foreground mb-8">
            Powerful tools for researchers, educators, and language professionals
          </p>
          
          {/* Billing Toggle */}
          <div className="flex items-center justify-center gap-4 mb-8">
            <span className={!isAnnual ? 'text-foreground font-medium' : 'text-muted-foreground'}>
              Monthly
            </span>
            <button
              onClick={() => setIsAnnual(!isAnnual)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                isAnnual ? 'bg-primary' : 'bg-muted'
              }`}
              data-testid="billing-toggle"
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  isAnnual ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            <span className={isAnnual ? 'text-foreground font-medium' : 'text-muted-foreground'}>
              Annual
              <span className="ml-2 text-sm bg-green-100 text-green-800 px-2 py-1 rounded-full">
                Save 17%
              </span>
            </span>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {plans.map((plan, index) => (
            <Card 
              key={plan.name} 
              className={`relative ${plan.popular ? 'border-primary shadow-lg scale-105' : ''}`}
              data-testid={`plan-${plan.name.toLowerCase()}`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <span className="bg-primary text-primary-foreground px-4 py-1 rounded-full text-sm font-medium">
                    Most Popular
                  </span>
                </div>
              )}
              
              <CardHeader className="text-center pb-4">
                <div className="flex items-center justify-center mb-4">
                  <div className="p-3 bg-primary/10 rounded-lg">
                    {plan.icon}
                  </div>
                </div>
                <CardTitle className="text-2xl">{plan.name}</CardTitle>
                <CardDescription className="text-base">
                  {plan.description}
                </CardDescription>
                <div className="pt-4">
                  <div className="text-4xl font-bold text-foreground">
                    ${isAnnual ? plan.price.annual : plan.price.monthly}
                    {plan.price.monthly > 0 && (
                      <span className="text-lg font-normal text-muted-foreground">
                        /{isAnnual ? 'year' : 'month'}
                      </span>
                    )}
                  </div>
                  {isAnnual && plan.price.monthly > 0 && (
                    <div className="text-sm text-muted-foreground">
                      ${(plan.price.annual / 12).toFixed(0)}/month billed annually
                    </div>
                  )}
                </div>
              </CardHeader>
              
              <CardContent>
                <ul className="space-y-3 mb-6">
                  {plan.features.map((feature, featureIndex) => (
                    <li key={featureIndex} className="flex items-start gap-3">
                      <Check className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                  {plan.limitations.map((limitation, limitIndex) => (
                    <li key={limitIndex} className="flex items-start gap-3 text-muted-foreground">
                      <span className="text-sm">• {limitation}</span>
                    </li>
                  ))}
                </ul>
                
                <Button 
                  className="w-full" 
                  variant={plan.popular ? 'default' : 'outline'}
                  onClick={() => {
                    if (plan.name === 'Free') {
                      setLocation('/');
                    } else if (plan.name === 'Enterprise') {
                      // Handle enterprise contact
                      window.open('mailto:sales@your-app.com?subject=Enterprise Plan Inquiry', '_blank');
                    } else {
                      // Handle Pro subscription
                      setLocation('/subscribe');
                    }
                  }}
                  data-testid={`cta-${plan.name.toLowerCase()}`}
                >
                  {plan.cta}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Features Comparison */}
        <div className="mt-20 text-center">
          <h2 className="text-3xl font-bold text-foreground mb-8">
            All Plans Include
          </h2>
          <div className="grid md:grid-cols-4 gap-6 max-w-4xl mx-auto">
            <div className="text-center">
              <Users className="h-8 w-8 mx-auto mb-4 text-primary" />
              <h3 className="font-semibold mb-2">Multi-language Support</h3>
              <p className="text-sm text-muted-foreground">
                Spanish, Greek, and expanding language coverage
              </p>
            </div>
            <div className="text-center">
              <Zap className="h-8 w-8 mx-auto mb-4 text-primary" />
              <h3 className="font-semibold mb-2">Real-time Processing</h3>
              <p className="text-sm text-muted-foreground">
                Fast linguistic analysis with live progress tracking
              </p>
            </div>
            <div className="text-center">
              <Crown className="h-8 w-8 mx-auto mb-4 text-primary" />
              <h3 className="font-semibold mb-2">Research-grade Accuracy</h3>
              <p className="text-sm text-muted-foreground">
                Universal Dependencies standard compliance
              </p>
            </div>
            <div className="text-center">
              <Check className="h-8 w-8 mx-auto mb-4 text-primary" />
              <h3 className="font-semibold mb-2">Mobile Responsive</h3>
              <p className="text-sm text-muted-foreground">
                Works perfectly on phones, tablets, and desktop
              </p>
            </div>
          </div>
        </div>

        {/* Back to App */}
        <div className="text-center mt-16">
          <Button 
            variant="ghost" 
            onClick={() => setLocation('/')}
            data-testid="back-to-app"
          >
            ← Back to App
          </Button>
        </div>
      </div>
    </div>
  );
}