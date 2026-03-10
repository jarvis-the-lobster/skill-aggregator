import { Link } from 'react-router-dom';
import { Zap, Target, Users, Rocket } from 'lucide-react';

export function AboutPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <div className="bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="text-center">
            <div className="flex justify-center mb-6">
              <div className="p-4 bg-primary-500 rounded-2xl">
                <Zap className="w-12 h-12 text-white" />
              </div>
            </div>
            <h1 className="text-4xl font-bold text-gray-900 mb-6">
              About SkillAggregator
            </h1>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              We believe learning new skills shouldn't be about endless searching. 
              SkillAggregator curates the best educational content so you can focus 
              on what matters most: actually learning.
            </p>
          </div>
        </div>
      </div>

      {/* Mission Section */}
      <section className="py-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="p-4 bg-primary-100 rounded-2xl w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <Target className="w-8 h-8 text-primary-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">Our Mission</h3>
              <p className="text-gray-600">
                Make quality education accessible by eliminating the time wasted 
                searching for the right learning materials.
              </p>
            </div>

            <div className="text-center">
              <div className="p-4 bg-primary-100 rounded-2xl w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8 text-primary-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">Our Community</h3>
              <p className="text-gray-600">
                Built for learners, by learners. We understand the frustration 
                of scattered resources and low-quality content.
              </p>
            </div>

            <div className="text-center">
              <div className="p-4 bg-primary-100 rounded-2xl w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <Rocket className="w-8 h-8 text-primary-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">Our Vision</h3>
              <p className="text-gray-600">
                A world where anyone can master any skill quickly, with the right 
                guidance and resources at their fingertips.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How We're Different */}
      <section className="bg-white py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">
            How We're Different
          </h2>
          
          <div className="space-y-8">
            <div className="flex items-start space-x-4">
              <div className="p-2 bg-green-100 rounded-lg flex-shrink-0">
                <Target className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Quality Over Quantity
                </h3>
                <p className="text-gray-600">
                  We don't just dump search results. Every piece of content is evaluated 
                  for quality, relevance, and educational value.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-4">
              <div className="p-2 bg-blue-100 rounded-lg flex-shrink-0">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Structured Learning Paths
                </h3>
                <p className="text-gray-600">
                  Content is organized by difficulty and learning sequence, so you 
                  progress logically from basics to advanced concepts.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-4">
              <div className="p-2 bg-purple-100 rounded-lg flex-shrink-0">
                <Rocket className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Multiple Content Types
                </h3>
                <p className="text-gray-600">
                  Videos, articles, tutorials, and courses all in one place. 
                  Learn the way that works best for you.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Team Section */}
      <section className="py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">
            Built by Learners
          </h2>
          <p className="text-lg text-gray-600 mb-8">
            SkillAggregator was created by Brent and Jarvis 🦞 — a human-AI team 
            passionate about making learning more efficient and enjoyable.
          </p>
          <div className="bg-gray-100 rounded-lg p-6">
            <p className="text-sm text-gray-500 italic">
              "We were frustrated by spending more time searching for learning materials 
              than actually learning. So we built the solution we wished existed."
            </p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-primary-600 text-white py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold mb-6">
            Ready to Learn Faster?
          </h2>
          <p className="text-xl mb-8 opacity-90">
            Join thousands of learners who are mastering new skills with 
            curated, high-quality content.
          </p>
          <Link to="/" className="bg-white text-primary-600 hover:bg-gray-100 font-semibold px-8 py-3 rounded-lg transition-colors">
            Start Learning Now
          </Link>
        </div>
      </section>
    </div>
  );
}