
export const scenarioConfig = {
  userDistribution: {
    totalWeight: 100,
    totalUVS: 100
  },
  scenarios: [
    {
      name: "create_Case",
      description: 'Create a Case',
      weight: 30,
      pages: [
        "createCase",
        "acceptCase",
        "addComment"
      ]
    },
    {
      name: "cancel_Case",
      description: 'Cancel a Case',
      weight: 20,
      pages: [
        "createCase",
        "acceptCase",
        "addComment",
        "cancelCase",
      ]
    },
    {
      name: "complete_Case",
      description: 'Complete a Case',
      weight: 30,
      pages: [
        "createCase",
        "acceptCase",
        "addComment",
        "markComplete",
      ]
    },
    {
      name: "incomplete_Case",
      description: 'Incomplete a Case',
      weight: 20,
      pages: [
        "createCase",
        "acceptCase",
        "addComment",
        "markInComplete",
      ]
    },
  ],
  thresholds: {
    http_req_duration: ["p(95)<800"],
    http_req_failed: ["rate<0.01"]
  },
  pages: {
    createCase: {
      apis: [
        {
          url: 'https://kyleDomain/ad-group/details',
          method: 'GET',
          name: 'getADGroup'
        },
        {
          url: 'https://kyleDomain/reference-type/list',
          method: 'GET',
          name: 'getReferenceList'
        },
        {
          url: 'https://kyleDomain/case/create',
          method: 'POST',
          name: 'getADGroup',
          body: {
            caseName: 'kyle',
            dueDate: '2025-10-01'
          }
        },
      ]
    },
    acceptCase: {
      apis: [
        {
          url: 'https://kyleDomain/ad-group/details',
          method: 'GET',
          name: 'getADGroup'
        },
        {
          url: 'https://kyleDomain/case/{caseId}/detail',
          method: 'GET',
          name: 'getCaseDetail'
        },
        {
          url: 'https://kyleDomain/case/accept/{caseId}',
          method: 'POST',
          name: 'acceptCase',
          body: {}
        },
      ]
    },
    addComment: {
      apis: [
        {
          url: 'https://kyleDomain/case/comment/add',
          method: 'POST',
          name: 'addComment',
          body: {
            caseId: '{caseId}',
            comment: 'Hi Kyle'
          }
        },
      ]
    },
    cancelCase: {
      apis: [
        {
          url: 'https://kyleDomain/case/close',
          method: 'POST',
          name: 'cancel',
          body: {
            caseId: '{caseId}',
            closeType: 'cancel',
            description: 'need to cancel'
          }
        },
      ]
    },
    completeCase: {
      apis: [
        {
          url: 'https://kyleDomain/case/close',
          method: 'POST',
          name: 'complete',
          body: {
            caseId: '{caseId}',
            closeType: 'complete',
            description: 'need to complete'
          }
        },
      ]
    },
    incompleteCase: {
      apis: [
        {
          url: 'https://kyleDomain/case/close',
          method: 'POST',
          name: 'incomplete',
          body: {
            caseId: '{caseId}',
            closeType: 'incomplete',
            description: 'need to incomplete'
          }
        },
      ]
    },
  }
}